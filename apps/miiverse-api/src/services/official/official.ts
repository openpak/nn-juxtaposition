/* The official Pakka account.
 *
 * Pakka is OpenPak's assistant. This module gives it a verified OpenVerse identity that is not a
 * player: no sign-in can resolve to it (it has no web_identities row), and the only way to act as
 * it is the key-protected /internal/v1/official routes below. Without PN_MIIVERSE_API_OFFICIAL_KEY
 * every route answers 404.
 *
 * What Pakka may do here is decided on Pakka's side (scopes, auto-publish versus staff approval,
 * kill switch, audit); this side only authenticates the caller and keeps the writes safe to repeat:
 * a post's id is derived from its event id, a community is found again by name.
 */

import express from 'express';
import { config } from '@/config';
import { logger } from '@/logger';
import { getDb } from '@/database';
import { Community } from '@/models/community';
import { Post } from '@/models/post';
import { uploadHeaders, uploadIcons } from '@/images';
import { uploadCDNAsset } from '@/util';
import { createNewPost } from '@/services/internal/utils/posts';
import { generateCommunityId } from '@/services/internal/utils/communities';
import { defaultUserData, OFFICIAL_NAME, OFFICIAL_PID } from '@/services/web-identity/web-identity';
import { hexColor, iconLetter, renderBanner, renderIcon, renderPakkaAvatar } from '@/services/communities/seed-images';
import { composeBody, escapeRegex, keyMatches, postIdFor, postUrl, titleIdForms } from '@/services/official/helpers';
import { deletePostMedia } from '@/services/cdn/media';
import type { HydratedCommunityDocument } from '@/types/mongoose/community';

const FACES = ['normal_face', 'smile_open_mouth', 'wink_left', 'surprise_open_mouth', 'frustrated', 'sorrow'];
const PROFILE_COMMENT = 'The official OpenPak assistant account. I post news, results and community highlights.';
const VERSE_URL = 'https://verse.openpak.org';

let ensured = false;

/** Creates the Pakka user and uploads its avatar once per process. Safe to run again. */
export async function ensureOfficialAccount(): Promise<void> {
	if (ensured) {
		return;
	}
	const db = getDb();
	const existing = await db.user.findUnique({ where: { pid: OFFICIAL_PID } });
	if (!existing) {
		const data = defaultUserData(OFFICIAL_PID, OFFICIAL_NAME);
		(data.settings as { create: Record<string, unknown> }).create.profileComment = PROFILE_COMMENT;
		(data.settings as { create: Record<string, unknown> }).create.notifyEmpathy = false;
		(data.settings as { create: Record<string, unknown> }).create.notifyFollows = false;
		(data.settings as { create: Record<string, unknown> }).create.notifyReply = false;
		try {
			await db.user.create({ data: data as never });
		} catch (e) {
			if ((e as { code?: string }).code !== 'P2002') {
				throw e;
			}
		}
	}
	const avatar = renderPakkaAvatar();
	for (const face of FACES) {
		if (!await uploadCDNAsset(`mii/${OFFICIAL_PID}/${face}.png`, avatar, 'public-read')) {
			throw new Error(`Could not upload the Pakka avatar (${face})`);
		}
	}
	ensured = true;
	logger.info('official account ready');
}

export type CommunityRef = { id?: string; titleId?: string; name?: string };

/** Finds a community by id, then title id, then name. null when none matches. */
export async function resolveCommunity(ref: CommunityRef): Promise<HydratedCommunityDocument | null> {
	if (ref.id) {
		const c = await Community.findOne({ olive_community_id: ref.id });
		if (c) {
			return c;
		}
	}
	if (ref.titleId) {
		const c = await Community.findOne({ title_id: { $in: titleIdForms(ref.titleId) } });
		if (c) {
			return c;
		}
	}
	if (ref.name) {
		return Community.findOne({ name: { $regex: `^${escapeRegex(ref.name.trim())}$`, $options: 'i' } });
	}
	return null;
}

function publicCommunity(c: HydratedCommunityDocument): { id: string; name: string; titleIds: string[]; type: number; url: string } {
	return { id: c.olive_community_id, name: c.name, titleIds: c.title_id, type: c.type, url: `${VERSE_URL}/communities/${c.olive_community_id}` };
}

async function createCommunity(input: { name: string; description: string; titleIds: string[]; letter?: string; color?: string }): Promise<HydratedCommunityDocument> {
	const color = hexColor(input.color ?? '#4f46e5');
	const letter = input.letter ?? iconLetter(input.name);
	const communityId = await generateCommunityId();
	const icons = await uploadIcons({ icon: renderIcon(letter, color), communityId });
	const headers = await uploadHeaders({
		ctr_header: renderBanner(letter, color, 400, 220),
		wup_header: renderBanner(letter, color, 1280, 180),
		communityId
	});
	if (icons === null || headers === null) {
		throw new Error('Could not upload the community artwork');
	}
	const { randomBytes } = await import('node:crypto');
	return Community.create({
		platform_id: 2,
		name: input.name,
		description: input.description,
		open: true,
		allows_comments: true,
		type: 0,
		parent: null,
		owner: OFFICIAL_PID,
		created_at: new Date(),
		empathy_count: 0,
		has_shop_page: 0,
		icon: icons.tgaBlob,
		ctr_header: headers.ctr,
		wup_header: headers.wup,
		icon_paths: { 32: icons.icon32, 48: icons.icon48, 64: icons.icon64, 96: icons.icon96, 128: icons.icon128 },
		title_id: input.titleIds,
		community_id: communityId,
		olive_community_id: (randomBytes(8).readBigUInt64BE(0) | (1n << 63n)).toString(),
		is_recommended: 0,
		app_data: '',
		permissions: { open: true, minimum_new_post_access_level: 0, minimum_new_comment_access_level: 0, minimum_new_community_access_level: 3 }
	});
}

function requireKey(req: express.Request, res: express.Response, next: express.NextFunction): void {
	// api.olv.openpak.org is routed publicly by Traefik, which adds X-Forwarded-For. Pakka connects
	// directly on the private network and carries none: those only (same rule as /internal/v1/activity).
	if (config.official.key === '' || req.get('x-forwarded-for') !== undefined) {
		res.status(404).json({ error: 'not_found' });
		return;
	}
	if (!keyMatches(req.get('x-internal-key'), config.official.key)) {
		res.status(401).json({ error: 'unauthorized' });
		return;
	}
	next();
}

function str(v: unknown, max: number): string | null {
	return typeof v === 'string' && v.trim() !== '' && v.length <= max ? v.trim() : null;
}

function ref(v: unknown): CommunityRef {
	const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
	return {
		id: typeof o.id === 'string' ? o.id : undefined,
		titleId: typeof o.titleId === 'string' ? o.titleId : undefined,
		name: typeof o.name === 'string' ? o.name : undefined
	};
}

function fail(res: express.Response, status: number, error: string, detail?: string): void {
	res.status(status).json(detail ? { error, detail } : { error });
}

export const officialRouter = express.Router();
// Images travel as base64: leave room for a few MB, still bounded.
officialRouter.use(express.json({ limit: '8mb' }));
officialRouter.use(requireKey);

officialRouter.get('/account', async (_req, res, next) => {
	try {
		await ensureOfficialAccount();
		res.json({ pid: OFFICIAL_PID, name: OFFICIAL_NAME, verified: true, url: `${VERSE_URL}/users/${OFFICIAL_PID}` });
	} catch (e) {
		next(e);
	}
});

officialRouter.get('/communities', async (req, res, next) => {
	try {
		const c = await resolveCommunity({ id: String(req.query.id ?? '') || undefined, titleId: String(req.query.titleId ?? '') || undefined, name: String(req.query.name ?? '') || undefined });
		if (!c) {
			return fail(res, 404, 'not_found');
		}
		res.json(publicCommunity(c));
	} catch (e) {
		next(e);
	}
});

// Creates a community, or answers the existing one (matched by name, then title id). Staff approval
// happens on Pakka's side before this is called.
officialRouter.post('/communities', async (req, res, next) => {
	try {
		const name = str(req.body?.name, 60);
		const description = str(req.body?.description, 280);
		const titleIds: string[] = Array.isArray(req.body?.titleIds) ? req.body.titleIds.filter((t: unknown) => typeof t === 'string' && /^\d{1,20}$/.test(t)) : [];
		if (!name || !description) {
			return fail(res, 400, 'bad_request', 'name (1-60) and description (1-280) are required');
		}
		await ensureOfficialAccount();
		for (const t of titleIds) {
			const c = await resolveCommunity({ titleId: t });
			if (c) {
				return res.json({ ...publicCommunity(c), created: false });
			}
		}
		const same = await resolveCommunity({ name });
		if (same) {
			return res.json({ ...publicCommunity(same), created: false });
		}
		const c = await createCommunity({ name, description, titleIds, letter: str(req.body?.letter, 1) ?? undefined, color: typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : undefined });
		logger.info({ community: c.olive_community_id, name }, 'official community created');
		res.status(201).json({ ...publicCommunity(c), created: true });
	} catch (e) {
		next(e);
	}
});

// Posts as Pakka. `eventId` makes it repeatable: the same event answers the first post.
officialRouter.post('/posts', async (req, res, next) => {
	try {
		const eventId = str(req.body?.eventId, 200);
		const text = str(req.body?.body, 1200);
		if (!eventId || !text) {
			return fail(res, 400, 'bad_request', 'eventId and body are required');
		}
		const id = postIdFor(eventId);
		const url = postUrl(VERSE_URL, id);
		const already = await Post.findOne({ id });
		if (already) {
			return res.json({ id, url, communityId: already.community_id, created: false });
		}
		const community = await resolveCommunity(ref(req.body?.community));
		if (!community) {
			return fail(res, 404, 'community_not_found');
		}
		let image: string | undefined;
		if (typeof req.body?.image === 'string' && req.body.image !== '') {
			if (community.title_id.length === 0) {
				return fail(res, 422, 'image_unsupported', 'this community takes no images');
			}
			image = req.body.image;
		}
		await ensureOfficialAccount();
		const post = await createNewPost({
			id,
			official: true,
			author: { pid: OFFICIAL_PID, screenName: OFFICIAL_NAME, miiData: '', verified: true },
			body: {
				body: composeBody(text, req.body?.discuss === true ? url : null),
				feelingId: 0,
				isSpoiler: false,
				isAppJumpable: false,
				screenshot: image ? { file: image, titleId: community.title_id[0]! } : undefined
			},
			community,
			parentPost: null
		});
		logger.info({ post: post.id, community: community.olive_community_id }, 'official post created');
		res.status(201).json({ id, url, communityId: community.olive_community_id, created: true });
	} catch (e) {
		next(e);
	}
});

// Removes one of Pakka's own posts (cleanup and rollback). Other people's posts are never touched.
officialRouter.delete('/posts/:id', async (req, res, next) => {
	try {
		const post = await Post.findOne({ id: req.params.id, pid: OFFICIAL_PID });
		if (!post) {
			return fail(res, 404, 'not_found');
		}
		// Media first: an interrupted run then leaves a row to retry from, never loose files.
		await deletePostMedia(post);
		await Post.deleteOne({ _id: post._id });
		res.json({ deleted: true });
	} catch (e) {
		next(e);
	}
});

// The most Yeah'd posts of the last days, never Pakka's own: the raw material of the weekly
// "Best of OpenVerse" draft. Public posts only.
officialRouter.get('/top', async (req, res, next) => {
	try {
		const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
		const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
		const since = new Date(Date.now() - days * 86_400_000);
		const posts = await Post.find({ created_at: { $gte: since }, pid: { $ne: OFFICIAL_PID }, removed: false, message_to_pid: null, parent: null, is_spoiler: 0, empathy_count: { $gt: 0 } })
			.sort({ empathy_count: -1, created_at: -1 })
			.limit(limit);
		const communities = await Community.find({ olive_community_id: { $in: posts.map(p => p.community_id) } });
		res.json({
			posts: posts.map(p => ({
				id: p.id,
				url: postUrl(VERSE_URL, p.id),
				author: p.screen_name,
				community: communities.find(c => c.olive_community_id === p.community_id)?.name ?? '',
				body: p.body ?? '',
				yeahs: p.empathy_count,
				replies: p.reply_count
			}))
		});
	} catch (e) {
		next(e);
	}
});
