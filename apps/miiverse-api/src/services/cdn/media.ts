import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config } from '@/config';
import { logger } from '@/logger';
import { getS3 } from '@/s3';
import { bulkDeleteCDNAsset } from '@/util';

// Post media (screenshots and drawings) is deleted together with the post.
// Keys are derived from the poster pid and the post id, so they can be
// rebuilt even when the post row no longer lists them.

/** Prefixes that hold per-post media (as opposed to community icons and headers). */
export const POST_MEDIA_PREFIXES = ['screenshots/', 'paintings/'] as const;

export type PostMediaRef = {
	pid: number;
	id: string;
	painting_img?: string | null;
	painting_big?: string | null;
	screenshot?: string | null;
	screenshot_big?: string | null;
	screenshot_thumb?: string | null;
};

function cleanKey(key: string): string {
	return key.startsWith('/') ? key.slice(1) : key;
}

/** Every object key a post can own: the recorded ones plus the ones the upload code derives. */
export function postMediaKeys(post: PostMediaRef): string[] {
	const keys = new Set<string>();
	for (const field of [post.painting_img, post.painting_big, post.screenshot, post.screenshot_big, post.screenshot_thumb]) {
		if (field) {
			keys.add(cleanKey(field));
		}
	}
	const shot = `screenshots/${post.pid}/${post.id}`;
	const art = `paintings/${post.pid}/${post.id}`;
	for (const suffix of ['', '-thumb', '-big']) {
		keys.add(`${shot}${suffix}.jpg`);
	}
	for (const suffix of ['', '-big']) {
		keys.add(`${art}${suffix}.png`);
		keys.add(`${art}${suffix}.tga`);
	}
	return [...keys];
}

/** Deletes a post's media from the bucket. Returns false when the store refused. */
export async function deletePostMedia(post: PostMediaRef): Promise<boolean> {
	const ok = await bulkDeleteCDNAsset(postMediaKeys(post));
	if (!ok) {
		logger.error({ post: post.id, pid: post.pid }, 'post media could not be deleted; the orphan job will retry');
	}
	return ok;
}

/** The post a media key belongs to (`screenshots/<pid>/<id>[-thumb|-big].ext`), or null for a foreign key. */
export function postIdOfMediaKey(key: string): { pid: string; id: string } | null {
	const m = /^(?:screenshots|paintings)\/(\d+)\/(.+?)(?:-thumb|-big)?\.(?:jpg|png|tga)$/.exec(key);
	return m ? { pid: m[1]!, id: m[2]! } : null;
}

export async function listPostMediaKeys(): Promise<string[]> {
	const keys: string[] = [];
	for (const Prefix of POST_MEDIA_PREFIXES) {
		let token: string | undefined;
		do {
			const page = await getS3().send(new ListObjectsV2Command({ Bucket: config.s3.bucket, Prefix, ContinuationToken: token }));
			for (const o of page.Contents ?? []) {
				if (o.Key) {
					keys.push(o.Key);
				}
			}
			token = page.IsTruncated ? page.NextContinuationToken : undefined;
		} while (token);
	}
	return keys;
}
