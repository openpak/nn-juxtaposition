import '@/extend-zod'; // Needs to be the first import
import { describe, expect, it } from 'vitest';
import { BURST_MAX, DAILY_MAX, cleanImage, cleanLink, ingestActivity, liveCategories } from '@/services/activity/activity';
import type { ActivityDb, IngestOptions, PostRow } from '@/services/activity/activity';

function fakeDb(opts: { enabled?: boolean; categories?: string[]; identity?: boolean } = {}): ActivityDb & { rows: PostRow[] } {
	const rows: PostRow[] = [];
	let id = 0;
	const identity = opts.identity ?? true;
	return {
		rows,
		webIdentity: { findUnique: async ({ where }) => (identity ? { accountId: where.accountId } : null) },
		activitySetting: {
			findUnique: async ({ where }) => opts.enabled === undefined && !opts.categories
				? null
				: { accountId: where.accountId, enabled: opts.enabled ?? true, categories: opts.categories ?? ['badge'] }
		},
		activityPost: {
			findUnique: async ({ where }) => rows.find(r => r.eventId === where.eventId) ?? null,
			count: async ({ where }) => rows.filter(r => r.accountId === where.accountId && !r.digest && !r.folded && r.createdAt >= where.createdAt.gte).length,
			create: async ({ data }) => {
				if (rows.some(r => r.eventId === data.eventId)) {
					throw Object.assign(new Error('unique'), { code: 'P2002' });
				}
				const row = { ...data, id: ++id };
				rows.push(row);
				return row;
			},
			upsert: async ({ where, create, update }) => {
				const hit = rows.find(r => r.eventId === where.eventId);
				if (hit) {
					hit.count += update.count.increment;
					hit.createdAt = update.createdAt;
					return hit;
				}
				const row = { ...create, id: ++id };
				rows.push(row);
				return row;
			}
		}
	};
}

const base = new Date('2026-11-02T12:00:00Z');
const live = liveCategories('badge');
function options(over: Partial<IngestOptions> = {}): IngestOptions {
	return { live, imageHosts: 'rewards.openpak.org', isReadOnly: async () => false, now: base, ...over };
}
function event(n: number, over: Record<string, unknown> = {}): Parameters<typeof ingestActivity>[1] {
	return { eventId: `e${n}`, accountId: 'acc', category: 'badge', subject: `Badge ${n}`, ...over } as never;
}

describe('activity posts', () => {
	it('posts nothing unless the account opted in (off by default)', async () => {
		expect((await ingestActivity(fakeDb({ identity: true }), event(1), options())).status).toBe('not_opted_in');
		expect((await ingestActivity(fakeDb({ enabled: false }), event(1), options())).status).toBe('not_opted_in');
		expect((await ingestActivity(fakeDb({ enabled: true, categories: [] }), event(1), options())).status).toBe('not_opted_in');
	});

	it('knows nothing of an account that never signed in to OpenVerse', async () => {
		expect((await ingestActivity(fakeDb({ enabled: true, identity: false }), event(1), options())).status).toBe('no_account');
	});

	it('posts for an opted-in account and is idempotent by event id', async () => {
		const db = fakeDb({ enabled: true });
		expect((await ingestActivity(db, event(1), options())).status).toBe('posted');
		expect((await ingestActivity(db, event(1), options())).status).toBe('duplicate');
		expect(db.rows).toHaveLength(1);
		expect(db.rows[0]?.subject).toBe('Badge 1');
	});

	it('refuses a category without a source even if the player switched it on', async () => {
		const db = fakeDb({ enabled: true, categories: ['trade'] });
		expect((await ingestActivity(db, event(1, { category: 'trade' }), options())).status).toBe('not_opted_in');
	});

	it('rejects unknown categories, empty subjects and stale moments', async () => {
		const db = fakeDb({ enabled: true });
		expect((await ingestActivity(db, event(1, { category: 'nope' }), options())).status).toBe('rejected');
		expect((await ingestActivity(db, event(2, { subject: '  ' }), options())).status).toBe('rejected');
		expect((await ingestActivity(db, event(3, { occurredAt: new Date('2026-10-01T00:00:00Z') }), options())).status).toBe('rejected');
		expect(db.rows).toHaveLength(0);
	});

	it('posts nothing for a supervised (read-only) account', async () => {
		const db = fakeDb({ enabled: true });
		expect((await ingestActivity(db, event(1), options({ isReadOnly: async () => true }))).status).toBe('supervised');
		expect(db.rows).toHaveLength(0);
	});

	it('collapses a burst into one digest post', async () => {
		const db = fakeDb({ enabled: true });
		const statuses: string[] = [];
		for (let i = 0; i < BURST_MAX + 3; i++) {
			statuses.push((await ingestActivity(db, event(i), options())).status);
		}
		expect(statuses.filter(s => s === 'posted')).toHaveLength(BURST_MAX);
		expect(statuses.filter(s => s === 'digested')).toHaveLength(3);
		const digests = db.rows.filter(r => r.digest);
		expect(digests).toHaveLength(1);
		expect(digests[0]?.count).toBe(3);
		// A retry of a folded moment stays a duplicate and does not grow the digest.
		expect((await ingestActivity(db, event(BURST_MAX + 1), options())).status).toBe('duplicate');
		expect(digests[0]?.count).toBe(3);
	});

	it('limits a day to DAILY_MAX posts, spread out', async () => {
		const db = fakeDb({ enabled: true });
		let posted = 0;
		for (let i = 0; i < DAILY_MAX + 5; i++) {
			const now = new Date(base.getTime() + i * 11 * 60 * 1000); // outside the burst window
			if ((await ingestActivity(db, event(i), options({ now }))).status === 'posted') {
				posted++;
			}
		}
		expect(posted).toBe(DAILY_MAX);
		expect(db.rows.find(r => r.digest)?.count).toBe(5);
	});
});

describe('links and images', () => {
	it('keeps site paths and openpak.org links only', () => {
		expect(cleanLink('/communities/1')).toBe('/communities/1');
		expect(cleanLink('https://openpak.org/account/rewards')).toBe('https://openpak.org/account/rewards');
		expect(cleanLink('https://kart.openpak.org/records/1')).toBe('https://kart.openpak.org/records/1');
		expect(cleanLink('https://evil.example/x')).toBe('');
		expect(cleanLink('https://openpak.org.evil.example/')).toBe('');
		expect(cleanLink('//evil.example')).toBe('');
		expect(cleanLink('javascript:alert(1)')).toBe('');
		expect(cleanLink('http://openpak.org/x')).toBe('');
	});

	it('takes images from our own hosts over https only', () => {
		const hosts = 'rewards.openpak.org,openpak.org';
		expect(cleanImage('https://rewards.openpak.org/v1/items/badge-first-steps/preview', hosts)).toContain('/v1/items/badge-first-steps/preview');
		expect(cleanImage('https://cdn.example/shot.png', hosts)).toBe('');
		expect(cleanImage('http://rewards.openpak.org/x.png', hosts)).toBe('');
		expect(cleanImage('https://user:pw@rewards.openpak.org/x.png', hosts)).toBe('');
	});

	it('only lists categories with a source', () => {
		expect(liveCategories('badge')).toEqual(['badge']);
		expect(liveCategories('trade, bogus,badge')).toEqual(['badge', 'trade']);
		expect(liveCategories('')).toEqual([]);
	});
});
