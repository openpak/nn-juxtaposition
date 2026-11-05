import { describe, expect, it } from 'vitest';
import { consoleName, syncAll, syncProfile } from '@/services/profile-sync/profile-sync';
import type { ProfileSyncDb } from '@/services/profile-sync/profile-sync';

type Row = { pid: number; displayName: string; pnid: string | null; lastSeen: Date };

function fakeDb(rows: Row[]): { db: ProfileSyncDb; rows: Row[]; updates: number } {
	const state = { updates: 0 };
	const db: ProfileSyncDb = {
		user: {
			async findUnique({ where }) {
				return rows.find(r => r.pid === where.pid) ?? null;
			},
			async findMany({ where }) {
				return rows.filter(r => r.pid <= where.pid.lte && (!where.lastSeen || r.lastSeen >= where.lastSeen.gte)).map(r => ({ pid: r.pid }));
			},
			async update({ where, data }) {
				state.updates++;
				Object.assign(rows.find(r => r.pid === where.pid)!, data);
				return data;
			}
		}
	};
	return {
		db,
		rows,
		get updates() {
			return state.updates;
		}
	};
}

const now = new Date();
const core = (name: string, username: string) => async () => ({ username, mii: { name } as never });

describe('syncProfile', () => {
	it('core wins: name and handle are copied, the normalised handle follows', async () => {
		const { db, rows } = fakeDb([{ pid: 1_000_000_001, displayName: 'Old', pnid: 'old', lastSeen: now }]);
		expect(await syncProfile(db, 1_000_000_001, core('New Name', 'NewHandle'))).toBe(true);
		expect(rows[0]).toMatchObject({ displayName: 'New Name', pnid: 'NewHandle', pnidNormalized: 'newhandle' });
	});

	it('writes nothing when the copy already equals the core', async () => {
		const f = fakeDb([{ pid: 1_000_000_001, displayName: 'Same', pnid: 'h', lastSeen: now }]);
		expect(await syncProfile(f.db, 1_000_000_001, core('Same', 'h'))).toBe(false);
		expect(f.updates).toBe(0);
	});

	it('never blanks a field the core did not return, and skips web-only and unknown players', async () => {
		const { db, rows } = fakeDb([
			{ pid: 1_000_000_001, displayName: 'Keep', pnid: 'keep', lastSeen: now },
			{ pid: 1_800_000_001, displayName: 'Web', pnid: null, lastSeen: now }
		]);
		expect(await syncProfile(db, 1_000_000_001, async () => ({ username: '', mii: undefined }))).toBe(false);
		expect(rows[0]).toMatchObject({ displayName: 'Keep', pnid: 'keep' });
		expect(await syncProfile(db, 1_800_000_001, core('X', 'x'))).toBe(false);
		expect(await syncProfile(db, 1_000_000_999, core('X', 'x'))).toBe(false);
	});
});

describe('syncAll', () => {
	it('repairs diverged rows, counts failures and keeps the old copy on a failure', async () => {
		const old = new Date(Date.now() - 90 * 86_400_000);
		const { db, rows } = fakeDb([
			{ pid: 1_000_000_001, displayName: 'A', pnid: 'a', lastSeen: now },
			{ pid: 1_000_000_002, displayName: 'B', pnid: 'b', lastSeen: now },
			{ pid: 1_000_000_003, displayName: 'C', pnid: 'c', lastSeen: old },
			{ pid: 1_800_000_001, displayName: 'Web', pnid: null, lastSeen: now }
		]);
		const source = async (pid: number) => {
			if (pid === 1_000_000_002) {
				throw new Error('account server down');
			}
			return { username: `h${pid}`, mii: { name: `c${pid % 1000}` } as never };
		};
		expect(await syncAll(db, source)).toEqual({ checked: 3, changed: 2, failed: 1 });
		expect(rows[1]).toMatchObject({ displayName: 'B', pnid: 'b' });
		expect(rows[3]).toMatchObject({ displayName: 'Web' });
		expect(await syncAll(db, source, new Date(Date.now() - 30 * 86_400_000))).toEqual({ checked: 2, changed: 0, failed: 1 });
	});
});

describe('consoleName', () => {
	it('cuts to ten characters, by character', () => {
		expect(consoleName('Short')).toBe('Short');
		expect(consoleName('A very long account name')).toBe('A very lon');
		expect(consoleName('\u{1F600}'.repeat(12))).toBe('\u{1F600}'.repeat(10));
	});

	it('does not downgrade a full core name whose projection the console already shows', async () => {
		const { db, rows } = fakeDb([{ pid: 1_000_000_001, displayName: 'A very long account name', pnid: 'h', lastSeen: now }]);
		expect(await syncProfile(db, 1_000_000_001, core('A very lon', 'h'))).toBe(false);
		expect(rows[0].displayName).toBe('A very long account name');
		expect(await syncProfile(db, 1_000_000_001, core('Renamed', 'h'))).toBe(true);
	});
});
