import { describe, expect, it } from 'vitest';
import {
	createDeviceLink, hashToken, listDeviceLinks, MAX_ACTIVE_LINKS, resolveDeviceToken, revokeDeviceLink
} from '@/services/device-link/device-link';
import type { DeviceLinkDb, DeviceLinkRow } from '@/services/device-link/device-link';

function fakeDb(identities: Record<string, number> = {}) {
	const rows: DeviceLinkRow[] = [];
	let n = 0;
	const db: DeviceLinkDb = {
		deviceLink: {
			async count({ where }) {
				return rows.filter(r => r.accountId === where.accountId && !r.revokedAt).length;
			},
			async create({ data }) {
				const row: DeviceLinkRow = { id: `id${++n}`, ...data, createdAt: new Date(), lastUsedAt: null, revokedAt: null };
				rows.push(row);
				return row;
			},
			async findUnique({ where }) {
				return rows.find(r => r.tokenHash === where.tokenHash) ?? null;
			},
			async findMany({ where }) {
				return rows.filter(r => r.accountId === where.accountId).reverse();
			},
			async updateMany({ where, data }) {
				const hit = rows.filter(r => r.id === where.id && (where.accountId === undefined || r.accountId === where.accountId) && (where.revokedAt !== null || !r.revokedAt));
				hit.forEach(r => Object.assign(r, data));
				return { count: hit.length };
			}
		},
		webIdentity: {
			async findUnique({ where }) {
				const pid = identities[where.accountId];
				return pid ? { pid } : null;
			}
		}
	};
	return { db, rows };
}

describe('device links', () => {
	it('mints a token, stores only its hash and resolves it to the account', async () => {
		const { db, rows } = fakeDb({ acc1: 1800000005 });
		const made = await createDeviceLink(db, { accountId: 'acc1', deviceClass: 'wii' });
		expect(made?.token.startsWith('ovd1.')).toBe(true);
		expect(rows[0]!.tokenHash).toBe(hashToken(made!.token));
		expect(JSON.stringify(rows)).not.toContain(made!.token);
		const got = await resolveDeviceToken(db, made!.token);
		expect(got).toMatchObject({ accountId: 'acc1', pid: 1800000005, deviceClass: 'wii' });
		expect(rows[0]!.lastUsedAt).not.toBeNull();
	});

	it('rejects unknown, malformed and revoked tokens', async () => {
		const { db } = fakeDb({ acc1: 1800000005 });
		const made = (await createDeviceLink(db, { accountId: 'acc1', deviceClass: 'ps3' }))!;
		expect(await resolveDeviceToken(db, 'ovd1.nope')).toBeNull();
		expect(await resolveDeviceToken(db, 'x'.repeat(30))).toBeNull();
		expect(await revokeDeviceLink(db, 'other', made.id)).toBe(false);
		expect(await resolveDeviceToken(db, made.token)).not.toBeNull();
		expect(await revokeDeviceLink(db, 'acc1', made.id)).toBe(true);
		expect(await resolveDeviceToken(db, made.token)).toBeNull();
		expect(await revokeDeviceLink(db, 'acc1', made.id)).toBe(false);
		expect(await listDeviceLinks(db, 'acc1')).toEqual([]);
	});

	it('caps the active links of one account', async () => {
		const { db } = fakeDb();
		for (let i = 0; i < MAX_ACTIVE_LINKS; i++) {
			expect(await createDeviceLink(db, { accountId: 'a', deviceClass: 'dsi' })).not.toBeNull();
		}
		expect(await createDeviceLink(db, { accountId: 'a', deviceClass: 'dsi' })).toBeNull();
		expect(await createDeviceLink(db, { accountId: 'b', deviceClass: 'dsi' })).not.toBeNull();
	});
});
