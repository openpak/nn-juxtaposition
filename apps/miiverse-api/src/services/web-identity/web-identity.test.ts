import { describe, expect, it } from 'vitest';
import {
	acceptRules, buildWebOnlyAccount, cleanDisplayName, DEFAULT_WEB_NAME, isConsolePid, isWebOnlyPid, MAX_CONSOLE_PID,
	resolveWebIdentity, WEB_ONLY_PID_MIN
} from '@/services/web-identity/web-identity';
import type { IdentityDb, IdentityRow } from '@/services/web-identity/web-identity';

/** An in-memory stand-in for the three Prisma calls the module uses; the sequence starts where the migration's does. */
function fakeDb(opts: { users?: Array<{ pid: number; displayName: string }> } = {}) {
	const identities: IdentityRow[] = [];
	const users = [...(opts.users ?? [])];
	const created: Array<Record<string, any>> = [];
	let seq = WEB_ONLY_PID_MIN;
	const db: IdentityDb = {
		webIdentity: {
			async findUnique({ where }) {
				return identities.find(i => i.accountId === where.accountId) ?? null;
			},
			async findFirst({ where }) {
				return identities.find(i => i.pid === where.pid) ?? null;
			},
			async create({ data }) {
				const row: IdentityRow = {
					accountId: data.accountId,
					pid: data.pid ?? seq++,
					linked: data.linked ?? false,
					rulesAcceptedAt: null
				};
				if (identities.some(i => i.pid === row.pid)) {
					throw Object.assign(new Error('unique'), { code: 'P2002' });
				}
				identities.push(row);
				return row;
			},
			async update({ where, data }) {
				const row = identities.find(i => i.accountId === where.accountId)!;
				Object.assign(row, data);
				return row;
			}
		},
		user: {
			async findUnique({ where }) {
				return users.find(u => u.pid === where.pid) ?? null;
			},
			async create({ data }) {
				created.push(data);
				users.push({ pid: data.pid as number, displayName: data.displayName as string });
				return data;
			},
			async update({ where, data }) {
				Object.assign(users.find(u => u.pid === where.pid)!, data);
				return data;
			}
		}
	};
	return { db, identities, users, created };
}

describe('pid ranges', () => {
	it('keeps web-only numbers above every console PID and inside 32 bits', () => {
		expect(WEB_ONLY_PID_MIN).toBe(MAX_CONSOLE_PID + 2);
		expect(isWebOnlyPid(MAX_CONSOLE_PID)).toBe(false);
		expect(isWebOnlyPid(MAX_CONSOLE_PID + 1)).toBe(false);
		expect(isWebOnlyPid(WEB_ONLY_PID_MIN)).toBe(true);
		expect(isWebOnlyPid(2_147_483_647)).toBe(true);
		expect(isWebOnlyPid(2_147_483_648)).toBe(false);
		expect(isConsolePid(1_800_000_000)).toBe(false);
		expect(isConsolePid(1_799_999_999)).toBe(true);
		expect(isConsolePid(null)).toBe(false);
		expect(isConsolePid(0)).toBe(false);
	});

	it('cleans names', () => {
		expect(cleanDisplayName('  Ada\u0000 Lovelace ')).toBe('Ada Lovelace');
		expect(cleanDisplayName('')).toBe(DEFAULT_WEB_NAME);
		expect(cleanDisplayName(undefined)).toBe(DEFAULT_WEB_NAME);
		expect(cleanDisplayName('x'.repeat(100))).toHaveLength(32);
	});
});

describe('first sign-in (no first-run page)', () => {
	it('creates the user for a Wii U-linked account under its real PID', async () => {
		const { db, identities, users, created } = fakeDb();
		const out = await resolveWebIdentity(db, { accountId: 'acc-1', displayName: 'Ada', wiiuPid: 1_234_567_890 });
		expect(out).toEqual({ pid: 1_234_567_890, linked: true, rulesAccepted: false });
		expect(identities).toHaveLength(1);
		expect(users).toEqual([{ pid: 1_234_567_890, displayName: 'Ada' }]);
		// the same defaults the console first-run page writes
		expect(created[0].accountStatus).toBe(0);
		expect(created[0].settings.create.profilePrivacy).toBe('Public');
		expect(created[0].settings.create.notifyReply).toBe(true);
	});

	it('creates a web-only user with a number outside the console range', async () => {
		const { db, users } = fakeDb();
		const out = await resolveWebIdentity(db, { accountId: 'acc-2', displayName: 'Grace', wiiuPid: null });
		expect(out.linked).toBe(false);
		expect(out.pid).toBe(WEB_ONLY_PID_MIN);
		expect(isWebOnlyPid(out.pid)).toBe(true);
		expect(users).toEqual([{ pid: WEB_ONLY_PID_MIN, displayName: 'Grace' }]);
	});

	it('gives two web-only accounts different numbers and never reuses one', async () => {
		const { db } = fakeDb();
		const a = await resolveWebIdentity(db, { accountId: 'a', displayName: 'A', wiiuPid: null });
		const b = await resolveWebIdentity(db, { accountId: 'b', displayName: 'B', wiiuPid: null });
		const a2 = await resolveWebIdentity(db, { accountId: 'a', displayName: 'A', wiiuPid: null });
		expect(new Set([a.pid, b.pid]).size).toBe(2);
		expect(a2.pid).toBe(a.pid);
	});

	it('ignores a wiiu_pid that no console account server could have issued', async () => {
		const { db } = fakeDb();
		const out = await resolveWebIdentity(db, { accountId: 'x', displayName: 'X', wiiuPid: 1_900_000_000 });
		expect(out.linked).toBe(false);
		expect(isWebOnlyPid(out.pid)).toBe(true);
	});

	it('keeps the row of a console player who already ran the applet and refreshes its name from the core', async () => {
		const { db, created, users } = fakeDb({ users: [{ pid: 1_111_111_111, displayName: 'Mii name' }] });
		const out = await resolveWebIdentity(db, { accountId: 'c', displayName: 'Web name', wiiuPid: 1_111_111_111 });
		expect(out.pid).toBe(1_111_111_111);
		expect(created).toHaveLength(0);
		expect(users[0].displayName).toBe('Web name');
	});

	it('is idempotent and follows a web-only name change', async () => {
		const { db, users, identities } = fakeDb();
		await resolveWebIdentity(db, { accountId: 'd', displayName: 'Old', wiiuPid: null });
		await resolveWebIdentity(db, { accountId: 'd', displayName: 'New', wiiuPid: null });
		expect(identities).toHaveLength(1);
		expect(users).toHaveLength(1);
		expect(users[0].displayName).toBe('New');
	});

	it('lets a console share name a new person but never rename one (keepName)', async () => {
		const { db, users } = fakeDb();
		await resolveWebIdentity(db, { accountId: 'k', displayName: 'Web name', wiiuPid: null });
		const again = await resolveWebIdentity(db, { accountId: 'k', displayName: 'Console nickname', wiiuPid: null, keepName: true });
		expect(again.pid).toBe(WEB_ONLY_PID_MIN);
		expect(users[0].displayName).toBe('Web name');
		await resolveWebIdentity(db, { accountId: 'n', displayName: 'Console nickname', wiiuPid: null, keepName: true });
		expect(users[1].displayName).toBe('Console nickname');
	});

	it('moves a web-only account to its real PID once a Wii U is linked', async () => {
		const { db, users } = fakeDb();
		const web = await resolveWebIdentity(db, { accountId: 'e', displayName: 'E', wiiuPid: null });
		const linked = await resolveWebIdentity(db, { accountId: 'e', displayName: 'E', wiiuPid: 1_500_000_000 });
		expect(linked).toMatchObject({ pid: 1_500_000_000, linked: true });
		expect(linked.pid).not.toBe(web.pid);
		expect(users.map(u => u.pid).sort()).toEqual([1_500_000_000, web.pid].sort());
	});
});

describe('community rules', () => {
	it('records the acceptance once and reports it on the next sign-in', async () => {
		const { db } = fakeDb();
		const first = await resolveWebIdentity(db, { accountId: 'r', displayName: 'R', wiiuPid: null });
		expect(first.rulesAccepted).toBe(false);
		expect(await acceptRules(db, first.pid)).toBe(true);
		expect((await resolveWebIdentity(db, { accountId: 'r', displayName: 'R', wiiuPid: null })).rulesAccepted).toBe(true);
	});

	it('refuses a number that belongs to no web account', async () => {
		const { db } = fakeDb();
		expect(await acceptRules(db, 1_234_567_890)).toBe(false);
	});
});

describe('web-only account record', () => {
	it('has no console account behind it', () => {
		const a = buildWebOnlyAccount(WEB_ONLY_PID_MIN);
		expect(a.pid).toBe(WEB_ONLY_PID_MIN);
		expect(a.mii).toBeUndefined();
		expect(a.deleted).toBe(false);
		expect(a.accessLevel).toBe(0);
		expect(a.username).toBe('');
	});
});
