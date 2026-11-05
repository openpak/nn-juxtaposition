/* users.display_name and users.pnid are a cache of the account core (card #131), never written first here.
 * The source is nn-account: its account.v2 GetUserData carries the core handle and the core account name
 * (the Mii name field), already refreshed at once by the core's profile_updated event. This module copies
 * both into the user row for console PIDs. Web-only players have no nn-account record; their name is
 * refreshed from the core at every web sign-in (services/web-identity). */

import { isConsolePid } from '@/services/web-identity/web-identity';
import type { GetUserDataResponse } from '@pretendonetwork/grpc/account/v2/get_user_data_rpc';

/** The console shows ten characters of the account name (nn-account store.ProfileName). */
export function consoleName(name: string): string {
	return Array.from(name).slice(0, 10).join('');
}

type CachedUser = { pid: number; displayName: string; pnid: string | null };

export type ProfileSyncDb = {
	user: {
		findUnique(args: { where: { pid: number } }): Promise<CachedUser | null>;
		findMany(args: { where: { pid: { lte: number }; lastSeen?: { gte: Date } }; select: { pid: true }; orderBy: { pid: 'asc' } }): Promise<Array<{ pid: number }>>;
		update(args: { where: { pid: number }; data: { displayName?: string; pnid?: string; pnidNormalized?: string } }): Promise<unknown>;
	};
};

export type ProfileSource = (pid: number) => Promise<Pick<GetUserDataResponse, 'username' | 'mii'>>;

/** Copies the core's name and handle into one user row. Returns true when the row changed. */
export async function syncProfile(db: ProfileSyncDb, pid: number, source: ProfileSource): Promise<boolean> {
	if (!isConsolePid(pid)) {
		return false;
	}
	const user = await db.user.findUnique({ where: { pid } });
	if (!user) {
		return false;
	}
	const core = await source(pid);
	const data: { displayName?: string; pnid?: string; pnidNormalized?: string } = {};
	const name = core.mii?.name;
	// nn-account hands out the ten character console projection of the core name; a full name already
	// cached here (web sign-in) that projects to the same text is up to date.
	if (name && name !== consoleName(user.displayName)) {
		data.displayName = name;
	}
	if (core.username && core.username !== user.pnid) {
		data.pnid = core.username;
		data.pnidNormalized = core.username.toLowerCase();
	}
	if (Object.keys(data).length === 0) {
		return false;
	}
	await db.user.update({ where: { pid }, data });
	return true;
}

export type SyncStats = { checked: number; changed: number; failed: number };

/**
 * Re-reads every console player seen since `since` (all of them when omitted). A failure on one row (the
 * account server down, a PID it no longer knows) is counted and skipped; the old copy stays.
 */
export async function syncAll(db: ProfileSyncDb, source: ProfileSource, since?: Date): Promise<SyncStats> {
	const rows = await db.user.findMany({
		where: since ? { pid: { lte: 1_799_999_999 }, lastSeen: { gte: since } } : { pid: { lte: 1_799_999_999 } },
		select: { pid: true },
		orderBy: { pid: 'asc' }
	});
	const stats: SyncStats = { checked: 0, changed: 0, failed: 0 };
	for (const row of rows) {
		stats.checked++;
		try {
			if (await syncProfile(db, row.pid, source)) {
				stats.changed++;
			}
		} catch {
			stats.failed++;
		}
	}
	return stats;
}

const INTERVAL_MS = 60 * 1000;
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The startup reconcile (every console player, core wins) and then a one minute sweep (nn-account is push-fresh, so a rename shows within a minute) for players
 * seen in the last 30 days. The timer never keeps the process alive.
 */
export function startProfileSync(db: ProfileSyncDb, source: ProfileSource, log: (stats: SyncStats, startup: boolean) => void): void {
	const run = (startup: boolean): void => {
		syncAll(db, source, startup ? undefined : new Date(Date.now() - RECENT_MS)).then(
			stats => log(stats, startup),
			() => log({ checked: 0, changed: 0, failed: -1 }, startup)
		);
	};
	run(true);
	setInterval(() => run(false), INTERVAL_MS).unref();
}
