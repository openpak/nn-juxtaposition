/* Account erasure (card openpak/prds#120).
 *
 * The website's erasure finaliser calls DELETE /internal/accounts/:id/data (http.ts) once an account's
 * grace period is over. Everything this service holds about the account goes:
 *
 *   Content:  the account's posts and comments (media files too), private messages sent to or from it
 *             (both sides, like chat), conversations it is in, its empathy ("yeah") on other people's
 *             posts, its favourites, reports it filed or that were filed about it, automod log rows
 *             about it. Moderation audit rows keep the action but lose the pid / context.
 *             (These were in Mongo until card openpak/prds#20; they are Postgres tables now too.)
 *   Account:  the user row (settings, follows both ways and community follows cascade), notifications
 *             to it and notifications that name it (it is taken out of grouped "X and 2 others"
 *             notices), its web identity, device links and activity settings / posts.
 *
 * Kept on purpose: other people's replies under a deleted post (their own words, now top-level
 * orphans reachable only by link) and communities it administered (staff-made, not its own content).
 *
 * The account's pids are its web identity pid plus the console pid nn-account resolves for it, so call
 * this BEFORE nn-account's own erasure. Idempotent: a second run finds nothing. */

import { logger } from '@/logger';
import { config } from '@/config';
import { getDb } from '@/database';
import { Post } from '@/models/post';
import { Conversation } from '@/models/conversation';
import { Community } from '@/models/community';
import { bulkDeleteCDNAsset } from '@/util';
import { postMediaKeys } from '@/services/cdn/media';

export const SERVICE = 'nn-juxtaposition';

export type EraseStore = {
	/** Every pid the account has here. Throws when it cannot find out (a retry, not "nothing"). */
	pidsOf(accountId: string): Promise<number[]>;
	/** Posts, messages, conversations, favourites, reports and moderation rows, by pid. Returns rows touched. */
	eraseContent(pids: number[]): Promise<number>;
	/** The account rows, by pid and account id (runs last: it removes the web identity the pids came from). */
	erasePostgres(accountId: string, pids: number[]): Promise<number>;
};

export async function eraseAccount(accountId: string, store: EraseStore = realStore): Promise<number> {
	const pids = await store.pidsOf(accountId);
	const content = pids.length > 0 ? await store.eraseContent(pids) : 0;
	const pg = await store.erasePostgres(accountId, pids);
	const rows = content + pg;
	logger.info(`account erased account=${accountId} rows=${rows} service=${SERVICE}`);
	return rows;
}

async function consolePid(accountId: string): Promise<number | null> {
	if (config.openpak.nnasUrl === '') {
		return null;
	}
	const url = `${config.openpak.nnasUrl}/internal/resolve/account?namespace=wiiu&account=${encodeURIComponent(accountId)}`;
	const response = await fetch(url, { headers: { 'X-Internal-Key': config.openpak.nnasKey }, signal: AbortSignal.timeout(10_000) });
	if (!response.ok) {
		throw new Error(`resolve account: ${response.status}`);
	}
	const body = (await response.json()) as { found?: boolean; pid?: number };
	return body.found && body.pid ? body.pid : null;
}

const pageLimit = 100;

export const realStore: EraseStore = {
	async pidsOf(accountId) {
		const pids = new Set<number>();
		const web = await getDb().webIdentity.findUnique({ where: { accountId } });
		if (web) {
			pids.add(web.pid);
		}
		const console_ = await consolePid(accountId);
		if (console_ !== null) {
			pids.add(console_);
		}
		return [...pids];
	},

	async eraseContent(pids) {
		let rows = 0;
		const strPids = pids.map(String);
		const mine = { OR: [{ pid: { in: pids } }, { message_to_pid: { in: strPids } }] };

		// Posts, comments and messages, media first. Each page is gone before the next is read.
		for (;;) {
			const posts = await Post.findRows(mine, { take: pageLimit });
			if (posts.length === 0) {
				break;
			}
			await bulkDeleteCDNAsset(posts.flatMap(p => postMediaKeys(p)));
			const parents = new Map<string, number>();
			for (const p of posts) {
				if (p.parent && !pids.includes(p.pid)) {
					parents.set(p.parent, (parents.get(p.parent) ?? 0) + 1);
				}
			}
			await Post.deleteMany({ id: { in: posts.map(p => p.id) } });
			for (const [id, n] of parents) {
				await Post.incrementReplies(id, -n);
			}
			rows += posts.length;
		}

		const db = getDb();
		for (const pid of pids) {
			rows += await Post.removeEmpathiesBy(pid);
		}
		rows += await Post.updateMany({ removed_by: { in: pids } }, { removed_by: 0 });
		rows += await Conversation.deleteWithUsers(pids);
		rows += await Community.forgetPids(pids);
		rows += (await db.report.deleteMany({ where: { OR: [{ pid: { in: pids } }, { reported_by: { in: pids } }] } })).count;
		rows += (await db.automodLog.deleteMany({ where: { author: { in: pids } } })).count;
		rows += (await db.auditLog.updateMany({ where: { actor: { in: pids } }, data: { actor: 0 } })).count;
		rows += (await db.auditLog.updateMany({ where: { target: { in: strPids } }, data: { target: '0', context: '' } })).count;
		return rows;
	},

	async erasePostgres(accountId, pids) {
		const db = getDb();
		return db.$transaction(async (tx) => {
			let rows = 0;
			if (pids.length > 0) {
				// Notices that will lose a recipient, so a notice nobody can read any more goes too.
				const touched = await tx.notificationRecipient.findMany({ where: { pid: { in: pids } }, select: { notificationId: true } });
				rows += (await tx.notificationRecipient.deleteMany({ where: { pid: { in: pids } } })).count;
				// Follow / empathy notices name who did it: take the account out of the list...
				rows += await tx.$executeRaw`
					UPDATE notifications SET content = jsonb_set(content, '{users}', COALESCE(
						(SELECT jsonb_agg(u) FROM jsonb_array_elements(content->'users') u WHERE NOT ((u->>'pid')::int = ANY(${pids}::int[]))), '[]'::jsonb))
					WHERE type IN ('Follow', 'Empathy') AND EXISTS (
						SELECT 1 FROM jsonb_array_elements(content->'users') u WHERE (u->>'pid')::int = ANY(${pids}::int[]))`;
				// ...and a notice left with nobody, or a reply notice about its comment, goes.
				rows += await tx.$executeRaw`
					DELETE FROM notifications WHERE
						(type IN ('Follow', 'Empathy') AND jsonb_array_length(content->'users') = 0)
						OR (type = 'Reply' AND (content->>'pid')::int = ANY(${pids}::int[]))`;
				const ids = touched.map(t => t.notificationId);
				if (ids.length > 0) {
					rows += await tx.$executeRaw`
						DELETE FROM notifications n WHERE n.id = ANY(${ids}::text[])
						AND NOT EXISTS (SELECT 1 FROM notification_recipients r WHERE r.notification_id = n.id)`;
				}
				rows += (await tx.userFollow.deleteMany({ where: { OR: [{ pid: { in: pids } }, { followingPid: { in: pids } }] } })).count;
				rows += (await tx.communityFollow.deleteMany({ where: { pid: { in: pids } } })).count;
				rows += (await tx.userSetting.deleteMany({ where: { pid: { in: pids } } })).count;
				rows += (await tx.user.deleteMany({ where: { pid: { in: pids } } })).count;
			}
			rows += (await tx.deviceLink.deleteMany({ where: { accountId } })).count;
			rows += (await tx.activityPost.deleteMany({ where: { accountId } })).count;
			rows += (await tx.activitySetting.deleteMany({ where: { accountId } })).count;
			rows += (await tx.webIdentity.deleteMany({ where: { accountId } })).count;
			return rows;
		});
	}
};
