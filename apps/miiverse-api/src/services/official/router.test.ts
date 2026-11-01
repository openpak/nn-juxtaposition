import '@/extend-zod'; // Needs to be the first import
import express from 'express';
import superRequest from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '@/config';
import { Post } from '@/models/post';
import { Community } from '@/models/community';
import { createNewPost } from '@/services/internal/utils/posts';
import { officialRouter } from '@/services/official/official';
import { OFFICIAL_PID } from '@/services/web-identity/web-identity';
import { postIdFor } from '@/services/official/helpers';

vi.mock('@/config', () => ({ config: { official: { key: '' } } }));
vi.mock('@/logger', () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
vi.mock('@/models/post', () => ({ Post: { findOne: vi.fn(), deleteOne: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/community', () => ({ Community: { findOne: vi.fn(), find: vi.fn(), create: vi.fn() } }));
vi.mock('@/services/internal/utils/posts', () => ({ createNewPost: vi.fn() }));
vi.mock('@/database', () => ({
	getDb: () => ({ user: { findUnique: async () => ({ pid: 1 }), create: async () => ({}) } })
}));
vi.mock('@/util', () => ({ uploadCDNAsset: async () => true }));
vi.mock('@/images', () => ({ uploadIcons: vi.fn(), uploadHeaders: vi.fn() }));

const app = express();
app.use('/internal/v1/official', officialRouter);
const KEY = 'official-test-key';
const community = { olive_community_id: '777', name: 'Announcements', title_id: [], type: 2 };

beforeEach(() => {
	vi.resetAllMocks();
	(config.official as { key: string }).key = KEY;
});

describe('official routes: who may call', () => {
	it('answer 404 when no key is configured', async () => {
		(config.official as { key: string }).key = '';
		const res = await superRequest(app).get('/internal/v1/official/account').set('x-internal-key', KEY);
		expect(res.status).toBe(404);
	});

	it('answer 404 to anything that came through the public proxy', async () => {
		const res = await superRequest(app).get('/internal/v1/official/account').set('x-internal-key', KEY).set('x-forwarded-for', '203.0.113.9');
		expect(res.status).toBe(404);
	});

	it('answer 401 to a missing or wrong key', async () => {
		expect((await superRequest(app).get('/internal/v1/official/account')).status).toBe(401);
		expect((await superRequest(app).get('/internal/v1/official/account').set('x-internal-key', 'nope')).status).toBe(401);
	});
});

describe('official posts', () => {
	it('creates a verified post once and answers the same post for a repeat', async () => {
		vi.mocked(Community.findOne).mockResolvedValue(community as never);
		vi.mocked(Post.findOne).mockResolvedValueOnce(null as never);
		vi.mocked(createNewPost).mockResolvedValue({ id: postIdFor('news:1') } as never);
		const first = await superRequest(app).post('/internal/v1/official/posts').set('x-internal-key', KEY)
			.send({ eventId: 'news:1', body: 'Hello', community: { name: 'Announcements' }, discuss: true });
		expect(first.status).toBe(201);
		expect(first.body.created).toBe(true);
		expect(first.body.id).toBe(postIdFor('news:1'));
		const call = vi.mocked(createNewPost).mock.calls[0]![0];
		expect(call.id).toBe(postIdFor('news:1'));
		expect(call.official).toBe(true);
		expect(call.author).toMatchObject({ pid: OFFICIAL_PID, screenName: 'Pakka', verified: true });
		expect(call.body.body).toContain(`Discuss: https://verse.openpak.org/posts/${postIdFor('news:1')}`);

		vi.mocked(Post.findOne).mockResolvedValueOnce({ id: postIdFor('news:1'), community_id: '777' } as never);
		const again = await superRequest(app).post('/internal/v1/official/posts').set('x-internal-key', KEY)
			.send({ eventId: 'news:1', body: 'Hello', community: { name: 'Announcements' } });
		expect(again.status).toBe(200);
		expect(again.body.created).toBe(false);
		expect(createNewPost).toHaveBeenCalledTimes(1);
	});

	it('refuses an unknown community, a missing event id and an image where none fits', async () => {
		vi.mocked(Post.findOne).mockResolvedValue(null as never);
		vi.mocked(Community.findOne).mockResolvedValue(null as never);
		const none = await superRequest(app).post('/internal/v1/official/posts').set('x-internal-key', KEY).send({ eventId: 'e', body: 'x', community: { name: 'Nowhere' } });
		expect(none.status).toBe(404);
		const bad = await superRequest(app).post('/internal/v1/official/posts').set('x-internal-key', KEY).send({ body: 'x' });
		expect(bad.status).toBe(400);
		vi.mocked(Community.findOne).mockResolvedValue(community as never);
		const img = await superRequest(app).post('/internal/v1/official/posts').set('x-internal-key', KEY).send({ eventId: 'e2', body: 'x', image: 'QUJD', community: { name: 'Announcements' } });
		expect(img.status).toBe(422);
		expect(createNewPost).not.toHaveBeenCalled();
	});

	it('removes only Pakka\'s own posts', async () => {
		vi.mocked(Post.deleteOne).mockResolvedValue({ deletedCount: 1 } as never);
		const res = await superRequest(app).delete('/internal/v1/official/posts/abc').set('x-internal-key', KEY);
		expect(res.status).toBe(200);
		expect(Post.deleteOne).toHaveBeenCalledWith({ id: 'abc', pid: OFFICIAL_PID });
		vi.mocked(Post.deleteOne).mockResolvedValue({ deletedCount: 0 } as never);
		expect((await superRequest(app).delete('/internal/v1/official/posts/xyz').set('x-internal-key', KEY)).status).toBe(404);
	});
});

describe('official communities', () => {
	it('answers an existing community instead of creating a second one', async () => {
		vi.mocked(Community.findOne).mockResolvedValue({ ...community, name: 'Kirby', title_id: ['1'] } as never);
		const res = await superRequest(app).post('/internal/v1/official/communities').set('x-internal-key', KEY).send({ name: 'Kirby', description: 'All about Kirby' });
		expect(res.status).toBe(200);
		expect(res.body.created).toBe(false);
		expect(Community.create).not.toHaveBeenCalled();
	});

	it('needs a name and a description', async () => {
		const res = await superRequest(app).post('/internal/v1/official/communities').set('x-internal-key', KEY).send({ name: 'Kirby' });
		expect(res.status).toBe(400);
	});
});
