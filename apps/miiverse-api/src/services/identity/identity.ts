/* Who wrote a post: name and Mii, read from the account core when a post is served.
 *
 * Posts keep only the author's pid (card openpak/prds#20, owner rule: console services are adapters
 * over the core). The console wire format still carries screen_name, mii and mii_face_url per post,
 * so they are filled in here:
 *
 *   console pid   nn-account account.v2 GetUserData, which fronts the account and Mii core (one Mii per
 *                 account): mii.name and mii.data. nn-account hands out the ten character console form of
 *                 the name; when the cached full core name (users.display_name) has that same console form,
 *                 the full name is used (the same rule as the profile sync).
 *   web-only pid  no Mii; the name is users.display_name, the core display name cached at every web
 *                 sign-in (allowlisted cache, watched by openpak-dedup-check).
 *   Pakka         the official account's fixed name, no Mii.
 *
 * mii_face_url needs no lookup: it is the CDN face image of that pid for the post's feeling.
 *
 * Lookups are batched per list and cached in memory for a short while. A failed lookup never fails the
 * feed: the post gets the cached display name (or "Player") and an empty Mii, the failure is logged, and
 * the next request asks again. */

import { config } from '@/config';
import { logger } from '@/logger';
import { getDb } from '@/database';
import { getUserAccountData } from '@/util';
import { isOfficialPid, isWebOnlyPid, OFFICIAL_NAME } from '@/services/web-identity/web-identity';
import { consoleName } from '@/services/profile-sync/profile-sync';

export type Identity = {
	pid: number;
	/** The account name as the core has it */
	name: string;
	/** Nintendo base64 Mii data, '' when there is none (web-only, Pakka, lookup failed) */
	miiData: string;
};

export const FALLBACK_NAME = 'Player';
const TTL_MS = 60_000;
const MAX_ENTRIES = 5000;
const CONCURRENCY = 8;

const faces: Record<number, string> = {
	0: 'normal_face.png',
	1: 'smile_open_mouth.png',
	2: 'wink_left.png',
	3: 'surprise_open_mouth.png',
	4: 'frustrated.png',
	5: 'sorrow.png'
};

/** The CDN face image of a post's author for that feeling (web-only players share a default face) */
export function miiFaceUrl(pid: number, feelingId: number | null | undefined): string {
	const owner = isWebOnlyPid(pid) && !isOfficialPid(pid) ? 'default' : String(pid);
	return `${config.cdnUrl}/mii/${owner}/${faces[feelingId ?? 0] ?? faces[0]}`;
}

export type IdentitySource = {
	/** Console account from the core. Throws when the core cannot answer. */
	console(pid: number): Promise<{ name: string; miiData: string }>;
	/** Cached core display names (users.display_name) for these pids */
	displayNames(pids: number[]): Promise<Map<number, string>>;
};

export const coreSource: IdentitySource = {
	async console(pid) {
		const account = await getUserAccountData(pid);
		return { name: account.mii?.name ?? '', miiData: account.mii?.data ?? '' };
	},
	async displayNames(pids) {
		if (pids.length === 0) {
			return new Map();
		}
		const rows = await getDb().user.findMany({ where: { pid: { in: pids } }, select: { pid: true, displayName: true } });
		return new Map(rows.map(r => [r.pid, r.displayName]));
	}
};

const cache = new Map<number, { value: Identity; expires: number }>();

export function clearIdentityCache(): void {
	cache.clear();
}

function remember(value: Identity): void {
	if (cache.size >= MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) {
			cache.delete(oldest);
		}
	}
	cache.set(value.pid, { value, expires: Date.now() + TTL_MS });
}

/** Name and Mii for each pid (every pid gets an entry, a fallback one when the core cannot say) */
export async function resolveIdentities(pids: number[], source: IdentitySource = coreSource): Promise<Map<number, Identity>> {
	const out = new Map<number, Identity>();
	const now = Date.now();
	const todo: number[] = [];
	for (const pid of new Set(pids)) {
		const hit = cache.get(pid);
		if (hit && hit.expires > now) {
			out.set(pid, hit.value);
		} else if (isOfficialPid(pid)) {
			out.set(pid, { pid, name: OFFICIAL_NAME, miiData: '' });
		} else {
			todo.push(pid);
		}
	}
	if (todo.length === 0) {
		return out;
	}

	let names = new Map<number, string>();
	try {
		names = await source.displayNames(todo);
	} catch (e) {
		logger.warn({ err: e, count: todo.length }, 'identity: cached display names unavailable');
	}

	const consolePids = todo.filter(pid => !isWebOnlyPid(pid));
	for (const pid of todo.filter(pid => isWebOnlyPid(pid))) {
		const name = names.get(pid);
		const value = { pid, name: name ?? FALLBACK_NAME, miiData: '' };
		out.set(pid, value);
		if (name !== undefined) {
			remember(value);
		}
	}

	const failed: number[] = [];
	for (let i = 0; i < consolePids.length; i += CONCURRENCY) {
		await Promise.all(consolePids.slice(i, i + CONCURRENCY).map(async (pid) => {
			try {
				const core = await source.console(pid);
				const cached = names.get(pid);
				const name = core.name && cached && consoleName(cached) === core.name ? cached : core.name || cached || FALLBACK_NAME;
				const value = { pid, name, miiData: core.miiData };
				out.set(pid, value);
				remember(value);
			} catch {
				failed.push(pid);
				out.set(pid, { pid, name: names.get(pid) ?? FALLBACK_NAME, miiData: '' });
			}
		}));
	}
	if (failed.length > 0) {
		logger.warn({ pids: failed }, 'identity: account core lookup failed, serving fallback name and no Mii');
	}
	return out;
}
