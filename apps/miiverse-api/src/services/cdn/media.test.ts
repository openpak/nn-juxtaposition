import '@/extend-zod'; // Needs to be the first import
import { Readable } from 'node:stream';
import express from 'express';
import superRequest from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// In-memory bucket standing in for MinIO.
const bucket = new Map<string, Buffer>();
const fakeS3 = {
	async send(cmd: unknown) {
		if (cmd instanceof GetObjectCommand) {
			const v = bucket.get(cmd.input.Key!);
			if (!v) {
				throw Object.assign(new Error('nope'), { name: 'NoSuchKey' });
			}
			return { Body: Readable.from(v), ContentLength: v.length };
		}
		if (cmd instanceof DeleteObjectsCommand) {
			for (const o of cmd.input.Delete!.Objects!) {
				bucket.delete(o.Key!);
			}
			return {};
		}
		if (cmd instanceof ListObjectsV2Command) {
			return { Contents: [...bucket.keys()].filter(k => k.startsWith(cmd.input.Prefix ?? '')).map(Key => ({ Key })), IsTruncated: false };
		}
		throw new Error('unexpected command');
	}
};
vi.mock('@/s3', () => ({ getS3: () => fakeS3 }));
vi.mock('@/config', () => ({ config: { s3: { bucket: 'miiverse' }, official: { key: 'k' }, cdnUrl: '' } }));
vi.mock('@/logger', () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
vi.mock('@/util', async () => {
	const { DeleteObjectsCommand: Del } = await import('@aws-sdk/client-s3');
	return {
		getInvalidPostRegex: () => /$^/,
		bulkDeleteCDNAsset: async (keys: string[]) => {
			await fakeS3.send(new Del({ Bucket: 'miiverse', Delete: { Objects: keys.map(Key => ({ Key })) } }));
			return true;
		}
	};
});
vi.mock('@/models/community', () => ({ Community: {} }));

const { Post } = await import('@/models/post');
const { cdnRouter } = await import('@/services/cdn/index');
const { deleteAccountData } = await import('@/services/grpc/deleteAccountData');
const { cleanOrphanMedia } = await import('@/services/cdn/orphans');
const { postMediaKeys } = await import('@/services/cdn/media');

const app = express();
app.use(cdnRouter);

const PID = 1539606199;
function put(pid: number, id: string, kind: 'shot' | 'art'): string[] {
	const keys = kind === 'shot'
		? [`screenshots/${pid}/${id}.jpg`, `screenshots/${pid}/${id}-thumb.jpg`, `screenshots/${pid}/${id}-big.jpg`]
		: [`paintings/${pid}/${id}.png`, `paintings/${pid}/${id}-big.png`, `paintings/${pid}/${id}.tga`];
	for (const k of keys) {
		bucket.set(k, Buffer.from('img'));
	}
	return keys;
}
async function expectAll(keys: string[], status: number): Promise<void> {
	for (const k of keys) {
		expect((await superRequest(app).get(`/cdn/${k}`)).status, k).toBe(status);
	}
}

beforeEach(() => bucket.clear());

describe('a removed post (user, moderator, report, reply)', () => {
	it.each(['screenshot post', 'drawing reply'])('loses its media and its /cdn urls 404: %s', async (label) => {
		const reply = label.includes('reply');
		const keys = [...put(PID, 'p1', 'shot'), ...put(PID, 'p1', 'art')];
		const other = put(PID, 'keep', 'shot');
		const post = new Post({
			id: 'p1', pid: PID, community_id: 'c', created_at: new Date(), parent: reply ? 'root' : undefined,
			painting: 'TGAZBLOB', painting_img: `/paintings/${PID}/p1.png`, painting_big: `/paintings/${PID}/p1-big.png`,
			screenshot: `/screenshots/${PID}/p1.jpg`, screenshot_thumb: `/screenshots/${PID}/p1-thumb.jpg`, screenshot_big: `/screenshots/${PID}/p1-big.jpg`
		});
		const save = vi.spyOn(post, 'save').mockResolvedValue(post as never);
		await expectAll(keys, 200);

		await post.del('User requested removal', PID);

		expect(save).toHaveBeenCalled();
		expect(post.removed).toBe(true); // the row is kept for moderation history
		expect(post.painting).toBe('');
		expect(post.screenshot).toBe('');
		expect(post.screenshot_thumb).toBe('');
		await expectAll(keys, 404);
		await expectAll(other, 200); // other posts are untouched
	});
});

describe('account deletion', () => {
	it('removes every media object of the account posts', async () => {
		const keys = [...put(PID, 'a1', 'shot'), ...put(PID, 'a2', 'art')];
		const posts = [
			{ _id: 1, pid: PID, id: 'a1', screenshot: `/screenshots/${PID}/a1.jpg` },
			{ _id: 2, pid: PID, id: 'a2', painting: 'x' }
		];
		vi.spyOn(Post, 'find').mockImplementationOnce((() => ({ limit: async () => posts })) as never)
			.mockImplementation((() => ({ limit: async () => [] })) as never);
		vi.spyOn(Post, 'deleteMany').mockResolvedValue({} as never);
		const out = await deleteAccountData({ pid: PID });
		expect(out.postsDeleted).toBe(2);
		await expectAll(keys, 404);
	});
});

describe('official post removal', () => {
	it('deletes the row and the media', async () => {
		const { officialRouter } = await import('@/services/official/official');
		const { OFFICIAL_PID } = await import('@/services/web-identity/web-identity');
		const keys = put(OFFICIAL_PID, 'pk1', 'shot');
		vi.spyOn(Post, 'findOne').mockResolvedValue({ _id: 'o', id: 'pk1', pid: OFFICIAL_PID, screenshot: `/${keys[0]}` } as never);
		const del = vi.spyOn(Post, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as never);
		const a = express();
		a.use('/internal/v1/official', officialRouter);
		const res = await superRequest(a).delete('/internal/v1/official/posts/pk1').set('x-internal-key', 'k');
		expect(res.status).toBe(200);
		expect(del).toHaveBeenCalled();
		await expectAll(keys, 404);
	});
});

describe('orphan cleanup', () => {
	it('dry run changes nothing, apply deletes only media without a live post, a rerun finds none', async () => {
		const live = put(PID, 'live', 'shot');
		const gone = put(PID, 'gone', 'shot');
		const removed = put(PID, 'removed', 'art');
		bucket.set('icons/1/32.png', Buffer.from('x'));
		vi.spyOn(Post, 'find').mockImplementation(((q: { id: { $in: string[] } }) => ({
			lean: async () => q.id.$in.filter(i => i === 'live').map(id => ({ id }))
		})) as never);

		const dry = await cleanOrphanMedia({ dryRun: true });
		expect(dry.orphans.sort()).toEqual([...gone, ...removed].sort());
		expect(dry.live).toBe(live.length);
		expect(dry.deleted).toBe(0);
		await expectAll(gone, 200);

		const real = await cleanOrphanMedia({ dryRun: false });
		expect(real.deleted).toBe(gone.length + removed.length);
		await expectAll([...gone, ...removed], 404);
		await expectAll(live, 200);
		expect(bucket.has('icons/1/32.png')).toBe(true);

		const again = await cleanOrphanMedia({ dryRun: false });
		expect(again.orphans).toEqual([]);
	});
});

describe('keys', () => {
	it('lists the derived renders even when the row lists none', () => {
		const keys = postMediaKeys({ pid: 5, id: 'x' });
		expect(keys).toContain('screenshots/5/x.jpg');
		expect(keys).toContain('screenshots/5/x-thumb.jpg');
		expect(keys).toContain('paintings/5/x.png');
		expect(keys).toContain('paintings/5/x.tga');
	});
});
