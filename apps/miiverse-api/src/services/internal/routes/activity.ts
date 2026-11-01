import { z } from 'zod';
import { config } from '@/config';
import { errors } from '@/services/internal/errors';
import { guards } from '@/services/internal/middleware/guards';
import { createInternalApiRouter } from '@/services/internal/builder/router';
import { mapResult, resultSchema } from '@/services/internal/contract/result';
import { feedPageDtoSchema, mapFeedPage, pageControlSchema } from '@/services/internal/contract/page';
import { activityItemSchema, activitySettingsSchema, mapActivityItem } from '@/services/internal/contract/activity';
import { isCategory, liveCategories } from '@/services/activity/activity';
import type { PrismaClient } from '@/prisma/client';
import type { ActivityItemDto, ActivitySettingsDto } from '@/services/internal/contract/activity';
import type { PostRow } from '@/services/activity/activity';

export const activityRouter = createInternalApiRouter();

async function accountIdOf(db: PrismaClient, pid: number): Promise<string | null> {
	return (await db.webIdentity.findFirst({ where: { pid } }))?.accountId ?? null;
}

async function settingsFor(db: PrismaClient, accountId: string | null): Promise<ActivitySettingsDto> {
	const row = accountId ? await db.activitySetting.findUnique({ where: { accountId } }) : null;
	const enabled = row?.enabled ?? false;
	return {
		enabled,
		categories: liveCategories(config.activity.categories).map(id => ({ id, enabled: enabled && (row?.categories.includes(id) ?? false) }))
	};
}

/** Names and pids for the accounts behind some posts; banned or removed players are left out. */
async function mapRows(db: PrismaClient, rows: PostRow[]): Promise<ActivityItemDto[]> {
	const identities = await db.webIdentity.findMany({ where: { accountId: { in: [...new Set(rows.map(r => r.accountId))] } } });
	const users = await db.user.findMany({ where: { pid: { in: identities.map(i => i.pid) }, accountStatus: { in: [0, 1] } } });
	const out: ActivityItemDto[] = [];
	for (const r of rows) {
		const pid = identities.find(i => i.accountId === r.accountId)?.pid;
		const user = users.find(u => u.pid === pid);
		if (pid !== undefined && user) {
			out.push(mapActivityItem(r, pid, user.displayName));
		}
	}
	return out;
}

activityRouter.get({
	path: '/activity/settings',
	name: 'activity.settings.get',
	description: 'Get the automatic activity post settings (off by default)',
	guard: guards.user,
	schema: { response: activitySettingsSchema },
	async handler({ auth, db }) {
		return await settingsFor(db, await accountIdOf(db, auth!.pnid.pid));
	}
});

// A write: the read-only gate already refuses supervised accounts.
activityRouter.post({
	path: '/activity/settings',
	name: 'activity.settings.update',
	description: 'Turn automatic activity posts on or off, per category',
	guard: guards.user,
	schema: {
		body: z.object({
			enabled: z.boolean(),
			categories: z.array(z.string().max(32)).max(20)
		}),
		response: resultSchema
	},
	async handler({ body, auth, db }) {
		const accountId = await accountIdOf(db, auth!.pnid.pid);
		if (!accountId) {
			return mapResult('success');
		}
		const live = liveCategories(config.activity.categories);
		const categories = [...new Set(body.categories)].filter(c => isCategory(c) && live.includes(c));
		await db.activitySetting.upsert({
			where: { accountId },
			create: { accountId, enabled: body.enabled, categories },
			update: { enabled: body.enabled, categories }
		});
		return mapResult('success');
	}
});

const listQuery = z.object(pageControlSchema(50));

activityRouter.get({
	path: '/activity',
	name: 'activity.list',
	description: 'Activity posts of everyone, or of the people you follow and yourself',
	guard: guards.user,
	schema: {
		query: z.object({ scope: z.enum(['everyone', 'following']).default('everyone') }).extend(pageControlSchema(50)),
		response: feedPageDtoSchema(activityItemSchema)
	},
	async handler({ query, auth, db }) {
		let accountIds: string[] | null = null;
		if (query.scope === 'following') {
			const me = auth!.pnid.pid;
			const follows = await db.userFollow.findMany({ where: { pid: me } });
			const ids = await db.webIdentity.findMany({ where: { pid: { in: [me, ...follows.map(f => f.followingPid)] } } });
			accountIds = ids.map(i => i.accountId);
		}
		const rows = await db.activityPost.findMany({
			where: { folded: false, ...(accountIds ? { accountId: { in: accountIds } } : {}) },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			skip: query.offset,
			take: query.limit
		});
		return mapFeedPage(await mapRows(db, rows));
	}
});

activityRouter.get({
	path: '/users/:id/activity',
	name: 'users.activity.list',
	description: 'Activity posts of one player (shown on their profile)',
	guard: guards.user,
	schema: {
		params: z.object({ id: z.coerce.number() }),
		query: listQuery,
		response: feedPageDtoSchema(activityItemSchema)
	},
	async handler({ params, query, db }) {
		const accountId = await accountIdOf(db, params.id);
		if (!accountId) {
			return mapFeedPage([]);
		}
		const rows = await db.activityPost.findMany({
			where: { folded: false, accountId },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			skip: query.offset,
			take: query.limit
		});
		return mapFeedPage(await mapRows(db, rows));
	}
});

// A player may remove their own activity post (a moderator any). The read-only gate refuses supervised accounts.
activityRouter.delete({
	path: '/activity/:id',
	name: 'activity.delete',
	description: 'Remove an activity post',
	guard: guards.user,
	schema: {
		params: z.object({ id: z.coerce.number().int() }),
		response: resultSchema
	},
	async handler({ params, auth, db }) {
		const account = auth!;
		const row = await db.activityPost.findUnique({ where: { id: params.id } });
		if (!row || row.folded) {
			throw errors.for('not_found');
		}
		if (!account.moderator && row.accountId !== await accountIdOf(db, account.pnid.pid)) {
			throw errors.for('forbidden');
		}
		await db.activityPost.delete({ where: { id: row.id } });
		return mapResult('success');
	}
});
