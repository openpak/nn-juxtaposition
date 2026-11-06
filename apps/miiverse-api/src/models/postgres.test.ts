/* The Postgres data layer that replaced Mongo (card openpak/prds#20), against a real database:
 * PN_MIIVERSE_API_TEST_DATABASE_URL, migrated (`prisma migrate deploy`). Skipped without one.
 * The tables are emptied first, so point it at a throwaway database only. */
import '@/extend-zod'; // Needs to be the first import
import { beforeAll, describe, expect, it, vi } from 'vitest';

const url = process.env.PN_MIIVERSE_API_TEST_DATABASE_URL;

vi.mock('@/config', () => ({
	config: { db: { url: process.env.PN_MIIVERSE_API_TEST_DATABASE_URL }, cdnUrl: 'https://cdn.test', openpak: { nnasUrl: '' } }
}));
vi.mock('@/logger', () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));

const deletedMedia: string[] = [];
vi.mock('@/services/cdn/media', () => ({
	deletePostMedia: async (p: { id: string }) => {
		deletedMedia.push(p.id);
		return true;
	},
	postMediaKeys: (p: { id: string }) => [`screenshots/x/${p.id}.jpg`]
}));
vi.mock('@/util', async (importOriginal) => {
	const real = await importOriginal<Record<string, unknown>>();
	return {
		...real,
		bulkDeleteCDNAsset: async () => true,
		// The account core: pid 1700000099 is an account it cannot answer for
		getUserAccountData: async (pid: number) => {
			if (pid === 1700000099) {
				throw new Error('core down');
			}
			return { pid, mii: { name: `Core${pid}`, data: 'MIIDATA' } };
		}
	};
});

describe.skipIf(!url)('postgres data layer', async () => {
	const { getDb, setupPrisma } = await import('@/database');
	const { Post, PostDocument } = await import('@/models/post');
	const { Community, tryCreateCommunity } = await import('@/models/community');
	const { Conversation } = await import('@/models/conversation');
	const { clearIdentityCache } = await import('@/services/identity/identity');
	const { isUniqueViolation } = await import('@/models/row');
	const { realStore } = await import('@/services/erase/erase');

	const base = { community_id: 'c1', created_at: new Date('2026-01-01T00:00:00Z'), pid: 1700000001, feeling_id: 1, body: 'hello' };

	beforeAll(async () => {
		await setupPrisma();
		await getDb().$executeRawUnsafe('TRUNCATE posts, communities, conversations, conversation_users, endpoints, reports, automod_rules, automod_logs, audit_logs, users CASCADE');
		clearIdentityCache();
	});

	it('creates a post with a fresh id and serves the author from the core, not from the row', async () => {
		const post = await Post.create({ ...base, search_key: ['a', 'b'] });
		expect(post.id).toHaveLength(21);
		expect(post.screen_name).toBe('Core1700000001');
		expect(post.mii).toBe('MIIDATA');
		expect(post.mii_face_url).toBe('https://cdn.test/mii/1700000001/smile_open_mouth.png');
		const again = (await Post.findOne({ id: post.id }))!;
		expect(again).toBeInstanceOf(PostDocument);
		const wire = again.json({ with_mii: true });
		expect(wire.screen_name).toBe('Core170000'); // ten characters on the console
		expect(wire.mii).toBe('MIIDATA');
		expect(wire.mii_face_url).toBe('https://cdn.test/mii/1700000001/smile_open_mouth.png');
		expect(Object.keys(again.toJSON())).not.toContain('screen_name');
		const cols = await getDb().$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'posts'`;
		expect(cols.map(c => c.column_name)).not.toEqual(expect.arrayContaining(['screen_name']));
		expect(cols.map(c => c.column_name).filter(c => c.startsWith('mii'))).toEqual([]);
	});

	it('falls back to the cached name and no Mii when the core cannot answer, without failing the list', async () => {
		await getDb().user.create({ data: { pid: 1700000099, displayName: 'Cached Name', lastSeen: new Date(), accountStatus: 0 } });
		await Post.create({ ...base, pid: 1700000099, body: 'core is down' });
		await Post.create({ ...base, pid: 1800000123, body: 'web only' });
		const posts = await Post.find({ pid: { in: [1700000099, 1800000123] } });
		const down = posts.find(p => p.pid === 1700000099)!;
		expect(down.screen_name).toBe('Cached Name');
		expect(down.mii).toBe('');
		const web = posts.find(p => p.pid === 1800000123)!;
		expect(web.screen_name).toBe('Player'); // no users row: generic name
		expect(web.mii_face_url).toBe('https://cdn.test/mii/default/smile_open_mouth.png');
	});

	it('counts yeahs with one statement per request, also when they race', async () => {
		const post = await Post.create({ ...base, body: 'yeah me' });
		// the same player 20 times at once: one yeah
		await Promise.all(Array.from({ length: 20 }, () => Post.addEmpathy(post.id, 5)));
		// 30 different players at once
		await Promise.all(Array.from({ length: 30 }, (_, i) => Post.addEmpathy(post.id, 100 + i)));
		let row = (await getDb().post.findUnique({ where: { id: post.id } }))!;
		expect(row.empathy_count).toBe(31);
		expect(new Set(row.yeahs).size).toBe(31);
		expect(await Post.addEmpathy(post.id, 5)).toBeNull(); // already there
		await Promise.all(Array.from({ length: 10 }, () => Post.removeEmpathy(post.id, 5)));
		row = (await getDb().post.findUnique({ where: { id: post.id } }))!;
		expect(row.empathy_count).toBe(30);
		expect(row.yeahs).not.toContain(5);
		expect(await Post.removeEmpathy(post.id, 5)).toBeNull();
		expect(await Post.find({ yeahs: { has: 101 } })).toHaveLength(1);
	});

	it('moves reply_count with SQL increments, and save() never writes back a stale counter', async () => {
		const parent = await Post.create({ ...base, body: 'parent' });
		const loaded = (await Post.findOne({ id: parent.id }))!;
		await Promise.all(Array.from({ length: 12 }, () => Post.incrementReplies(parent.id, 1)));
		await Post.incrementReplies(parent.id, -2);
		loaded.body = 'edited';
		expect(loaded.isModified()).toBe(true);
		await loaded.save();
		const row = (await getDb().post.findUnique({ where: { id: parent.id } }))!;
		expect(row.reply_count).toBe(10);
		expect(row.body).toBe('edited');
		expect(loaded.isModified()).toBe(false);
	});

	it('removes a post: flags kept, media wiped', async () => {
		const post = await Post.create({ ...base, body: 'bye', painting: 'TGA', screenshot: '/s.jpg' });
		await post.del('rule 1', 42);
		const row = (await getDb().post.findUnique({ where: { id: post.id } }))!;
		expect(row).toMatchObject({ removed: true, removed_by: 42, removed_reason: 'rule 1', painting: '', screenshot: '' });
		expect(deletedMedia).toContain(post.id);
	});

	it('answers distinct_pid with each author\'s newest post, newest first, limit after the distinct', async () => {
		await getDb().post.deleteMany({ where: { community_id: 'dist' } });
		const at = (m: number): Date => new Date(Date.UTC(2026, 1, 1, 0, m));
		for (const [pid, m] of [[1, 1], [1, 5], [2, 2], [3, 3], [3, 9], [4, 4]] as const) {
			await Post.create({ ...base, community_id: 'dist', pid, created_at: at(m), body: `p${pid}m${m}` });
		}
		const posts = await Post.findNewestPerAuthor({ community_id: 'dist' }, 3);
		expect(posts.map(p => p.body)).toEqual(['p3m9', 'p1m5', 'p4m4']);
	});

	it('matches the Mongo query shapes: arrays, nulls, empty strings', async () => {
		await Post.create({ ...base, community_id: 'shape', search_key: ['k1'], app_data: 'AD', painting: 'X' });
		await Post.create({ ...base, community_id: 'shape', search_key: [], painting: '' });
		await Post.create({ ...base, community_id: 'shape', message_to_pid: '1700000002' });
		expect(await Post.count({ community_id: 'shape', search_key: { has: 'k1' } })).toBe(1);
		expect(await Post.count({ community_id: 'shape', app_data: { not: null } })).toBe(1);
		expect(await Post.count({ community_id: 'shape', painting: { not: null, notIn: [''] } })).toBe(1);
		expect(await Post.count({ community_id: 'shape', message_to_pid: null })).toBe(2);
		expect(await Post.count({ community_id: 'shape', removed_at: null })).toBe(3);
	});

	it('keeps a community\'s nested permissions and icon paths, and favourites race-free', async () => {
		const c = await tryCreateCommunity({
			platform_id: 0, name: 'Sub', description: 'd', icon: 'ICON', type: 1, parent: 'p1', owner: 7, title_id: ['0005000010101'],
			permissions: { minimum_new_post_access_level: 2 },
			icon_paths: { 32: '/i/32', 48: '/i/48', 64: '/i/64', 96: '/i/96', 128: '/i/128' }
		});
		expect(Number(c.community_id)).toBeGreaterThanOrEqual(0x80000);
		expect(BigInt(c.olive_community_id) >> 63n).toBe(1n);
		expect(c.permissions).toEqual({ open: true, minimum_new_post_access_level: 2, minimum_new_comment_access_level: 0, minimum_new_community_access_level: 3 });
		expect(c.icon_paths?.[128]).toBe('/i/128');
		expect((await Community.findOne({ title_id: { has: '0005000010101' } }))?.community_id).toBe(c.community_id);

		await Promise.all(Array.from({ length: 10 }, () => c.addUserFavorite(9)));
		await Promise.all([c.addUserFavorite(10), c.addUserFavorite(11)]);
		let fresh = (await Community.findOne({ community_id: c.community_id }))!;
		expect([...fresh.user_favorites].sort()).toEqual([10, 11, 9]);
		await c.delUserFavorite(9);
		fresh = (await Community.findOne({ community_id: c.community_id }))!;
		expect(fresh.user_favorites).not.toContain(9);
		expect(await Community.count({ parent: 'p1', user_favorites: { has: 10 } })).toBe(1);

		fresh.permissions.open = false;
		fresh.name = 'Renamed';
		await fresh.save();
		const updated = (await Community.updateOne({ olive_community_id: c.olive_community_id }, { icon_paths: null, description: 'new' }))!;
		expect(updated).toMatchObject({ name: 'Renamed', description: 'new', icon_paths: null });
		expect(updated.permissions.open).toBe(false);
		expect(updated.user_favorites.sort()).toEqual([10, 11]);
	});

	it('sees a taken community id as a unique violation (tryCreateCommunity rolls again on it)', async () => {
		const c = await Community.create({ community_id: 'dup1', olive_community_id: 'dupolive1', platform_id: 0, name: 'n', description: 'd', icon: '' });
		const err = await Community.create({ community_id: c.community_id, olive_community_id: 'other', platform_id: 0, name: 'n', description: 'd', icon: '' }).catch(e => e);
		expect(isUniqueViolation(err)).toBe(true);
		const err2 = await Post.create({ ...base, id: (await Post.create(base)).id }).catch(e => e);
		expect(isUniqueViolation(err2)).toBe(true);
	});

	it('finds a conversation by its two players and marks the recipient unread', async () => {
		const conv = await Conversation.create({ id: 'conv1', users: [{ pid: 1, official: false, read: true }, { pid: 2, official: false, read: true }] });
		await conv.newMessage('hi', 2);
		const found = (await Conversation.findByUsers(2, 1))!;
		expect(found.message_preview).toBe('hi');
		expect(found.users.find(u => u.pid === 2)?.read).toBe(false);
		expect(found.users.find(u => u.pid === 1)?.read).toBe(true);
		expect(await Conversation.findByUsers(1, 3)).toBeNull();
	});

	it('erases an account\'s content and its traces on other rows', async () => {
		const pid = 1700000555;
		const other = await Post.create({ ...base, body: 'someone else' });
		const mine = await Post.create({ ...base, pid, body: 'mine' });
		await Post.create({ ...base, pid, body: 'my reply', parent: other.id });
		await Post.incrementReplies(other.id, 1);
		await Post.create({ ...base, pid: 1, body: 'dm to them', message_to_pid: String(pid) });
		await Post.addEmpathy(other.id, pid);
		await Conversation.create({ id: 'conv-erase', users: [{ pid, official: false, read: true }, { pid: 1, official: false, read: true }] });
		const comm = await Community.create({ community_id: 'erase1', olive_community_id: 'eraseolive1', platform_id: 0, name: 'n', description: 'd', icon: '', owner: pid, admins: [pid, 3], user_favorites: [pid] });
		await getDb().report.create({ data: { pid, reported_by: 3, post_id: mine.id, reason: 1 } });
		await getDb().auditLog.create({ data: { actor: pid, action: 'REMOVE_POST', target: String(pid), context: 'x' } });

		const rows = await realStore.eraseContent([pid]);
		expect(rows).toBeGreaterThan(0);
		expect(await Post.count({ OR: [{ pid }, { message_to_pid: String(pid) }] })).toBe(0);
		const otherRow = (await getDb().post.findUnique({ where: { id: other.id } }))!;
		// reply_count of the other post is left alone: eraseContent only corrects parents for deleted
		// posts written by someone else (unchanged from the Mongo version)
		expect(otherRow).toMatchObject({ reply_count: 1, empathy_count: 0, yeahs: [] });
		expect(await Conversation.findByUsers(pid, 1)).toBeNull();
		expect((await Community.findOne({ community_id: comm.community_id }))).toMatchObject({ owner: null, admins: [3], user_favorites: [] });
		expect(await getDb().report.count({ where: { pid } })).toBe(0);
		expect(await getDb().auditLog.findFirst({ where: { context: 'x' } })).toBeNull();
		expect(await realStore.eraseContent([pid])).toBe(0); // idempotent
	});
});
