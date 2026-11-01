import { z } from 'zod';
import { extractMentionPids, parseJuxtMarkdown, renderToPlainText, transformJuxtMarkdown } from '@repo/common';
import { deletePostMedia } from '@/services/cdn/media';
import { uploadPainting, uploadScreenshot } from '@/images';
import { getShotModeForTitleId } from '@/services/api/routes/posts';
import { evaluateAutomodRules, getInvalidPostRegex, performAutomodAction } from '@/util';
import { config } from '@/config';
import { isOfficialPid, isWebOnlyPid } from '@/services/web-identity/web-identity';
import { getDb, getDuplicatePosts } from '@/database';
import { Post } from '@/models/post';
import { asOpenapi } from '@/services/internal/builder/openapi';
import { AutomodRule } from '@/models/automodRules';
import { errors } from '@/services/internal/errors';
import type { PaintingUrls } from '@/images';
import type { HydratedPostDocument, IPostInput } from '@/types/mongoose/post';
import type { HydratedCommunityDocument } from '@/types/mongoose/community';

export const postCreateSchema = asOpenapi('PostCreateBody', z.object({
	body: z.string().trim().optional(),
	feelingId: z.number(),
	isSpoiler: z.boolean().default(false),
	isAppJumpable: z.boolean().default(false),
	painting: z.object({
		file: z.base64(),
		isBmp: z.boolean()
	}).optional(),
	screenshot: z.object({
		file: z.base64(),
		titleId: z.string()
	}).optional(),
	languageId: z.number().optional(),
	countryId: z.number().optional(),
	platformId: z.number().optional(),
	regionId: z.number().optional()
}));

export type PostCreateBody = z.infer<typeof postCreateSchema>;

export type PostCreateOptions = {
	body: PostCreateBody;
	author: {
		pid: number;
		screenName: string;
		miiData: string;
		verified: boolean;
	};
	parentPost: HydratedPostDocument | null;
	community: HydratedCommunityDocument;
	/** A fixed post id, for callers that need to find the post again (the official account's idempotency) */
	id?: string;
	/** The official Pakka account: staff-controlled content skips the duplicate check and automod */
	official?: boolean;
	/**
	 * A Switch Album share (nx-share): the screenshot is the console's own capture of the game named here,
	 * so it is kept in the Switch room too, and the post carries the game's title id and name.
	 */
	consoleShare?: {
		titleId: string;
		titleName: string;
	};
};

const defaultMiiFaceFilename = 'normal_face.png';
const miiFaceFilenameMap: Record<number, string> = {
	0: 'normal_face.png',
	1: 'smile_open_mouth.png',
	2: 'wink_left.png',
	3: 'surprise_open_mouth.png',
	4: 'frustrated.png',
	5: 'sorrow.png'
};

export function isValidPost(post: PostCreateBody): boolean {
	const hasContent = post.body && post.body.length > 0;
	if (!hasContent && !post.painting && !post.screenshot) {
		return false; // No content
	}

	return true;
}

async function validateAndProcessPostBody(input: string): Promise<{ text: string; markdown: string } | null> {
	const cleanedBody = input.trim().replaceAll('\r\n', '\n');
	if (cleanedBody.length === 0) {
		return null;
	}

	if (getInvalidPostRegex().test(cleanedBody)) {
		throw new Error('Invalid characters found in post body');
	}

	if (cleanedBody.length > 280) {
		throw new Error('Post body is too long');
	}

	const transformed = await transformJuxtMarkdown(cleanedBody, {
		async lookupPnids(pnids) {
			const normalisedPnids = pnids.map(v => v.toLowerCase());
			const users = await getDb().user.findMany({
				where: {
					pnidNormalized: {
						in: normalisedPnids
					}
				},
				select: {
					pnidNormalized: true,
					pid: true
				}
			});
			return normalisedPnids.map((pnid) => {
				const user = users.find(v => v.pnidNormalized === pnid);
				return user ? { pid: user.pid } : null;
			});
		}
	});
	const ast = parseJuxtMarkdown(transformed);
	const mentionPids = extractMentionPids(ast);
	const mentionedUsers = await getDb().user.findMany({
		where: {
			pid: {
				in: mentionPids
			}
		}
	});
	const plainText = renderToPlainText(ast, mentionedUsers.map(v => ({ pid: v.pid, username: v.pnid ?? v.displayName ?? v.pid.toString() })));
	return {
		markdown: transformed,
		text: plainText
	};
}

/**
 * Create a new post from an input body
 * Warning: Does not check if it should be posted, validation should be done outside of this method
 */
export async function createNewPost(ops: PostCreateOptions): Promise<HydratedPostDocument> {
	const postId = ops.id ?? await generatePostUID(21);
	try {
		return await createNewPostWithId(ops, postId);
	} catch (e) {
		// Uploads happen before the checks (duplicate, automod, empty) and the insert; a post
		// that is refused must not leave its screenshot or drawing in the bucket.
		// (Never when a post with that id exists: a duplicate id must not wipe the live post's files.)
		if (!await Post.exists({ id: postId })) {
			await deletePostMedia({ pid: ops.author.pid, id: postId });
		}
		throw e;
	}
}

async function createNewPostWithId(ops: PostCreateOptions, postId: string): Promise<HydratedPostDocument> {
	const body = ops.body;

	let paintings: PaintingUrls | null = null;
	if (body.painting) {
		paintings = await uploadPainting({
			blob: body.painting.file,
			autodetectFormat: false,
			isBmp: body.painting.isBmp,
			pid: ops.author.pid,
			postId
		});
		if (paintings === null) {
			throw new Error('Failed to upload paintings');
		}
	}

	let screenshots = null;
	if (body.screenshot) {
		const shotMode = ops.consoleShare ? 'allow' : getShotModeForTitleId(ops.community, body.screenshot.titleId);
		if (shotMode !== 'block') {
			screenshots = await uploadScreenshot({
				blob: body.screenshot.file,
				pid: ops.author.pid,
				postId
			});
			if (screenshots === null) {
				throw new Error('Failed to upload screenshots');
			}
		}
	}

	const miiFace = miiFaceFilenameMap[body.feelingId] ?? defaultMiiFaceFilename;

	const postBody = body.body ? await validateAndProcessPostBody(body.body) : null;

	const document: IPostInput = {
		title_id: ops.consoleShare?.titleId || ops.community.title_id[0],
		topic_tag: ops.consoleShare?.titleName || undefined,
		community_id: ops.community.olive_community_id,
		screen_name: ops.author.screenName,
		body: postBody?.text,
		body_markdown: postBody?.markdown,
		painting: paintings?.blob ?? '',
		painting_img: paintings?.img ?? '',
		painting_big: paintings?.big ?? '',
		screenshot: screenshots?.full ?? '',
		screenshot_big: screenshots?.big ?? '',
		screenshot_length: screenshots?.fullLength ?? 0,
		screenshot_thumb: screenshots?.thumb ?? '',
		screenshot_aspect: screenshots?.aspect ?? '',
		country_id: body.countryId ?? 49,
		created_at: new Date(),
		feeling_id: body.feelingId,
		id: postId,
		is_autopost: 0,
		is_spoiler: body.isSpoiler ? 1 : 0,
		is_app_jumpable: body.isAppJumpable ? 1 : 0,
		language_id: body.languageId,
		mii: ops.author.miiData,
		// A web-only player has no Mii: consoles get the default avatar (uploaded by the seed)
		mii_face_url: `${config.cdnUrl}/mii/${isWebOnlyPid(ops.author.pid) && !isOfficialPid(ops.author.pid) ? 'default' : ops.author.pid}/${miiFace}`,
		pid: ops.author.pid,
		platform_id: body.platformId ?? 0,
		region_id: body.regionId ?? 2,
		verified: ops.author.verified,
		parent: ops.parentPost?.id
	};

	const maxDuplicatePostAgeMs = 5 * 60 * 1000;
	const duplicatePost = ops.official ? null : await getDuplicatePosts(ops.author.pid, document, maxDuplicatePostAgeMs);
	if (duplicatePost) {
		throw new Error('Duplicate post found');
	}

	if (document.body === '' && document.painting === '' && document.screenshot === '') {
		throw new Error('No valid post content');
	}

	// Automod
	if (!ops.official) {
		const automodRules = await AutomodRule.find({ enabled: true });
		const automodEval = evaluateAutomodRules(document, automodRules);
		const automodResult = await performAutomodAction(document, automodEval);
		if (!automodResult.allowPost) {
			throw errors.for('automod_prevented');
		}
	}

	const newPost = await Post.create(document);

	if (ops.parentPost) {
		await Post.findOneAndUpdate({
			id: ops.parentPost.id
		}, {
			$inc: {
				reply_count: 1
			}
		});
	}

	return newPost;
}

async function generatePostUID(length: number): Promise<string> {
	let id = Buffer.from(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(length * 2))), 'binary').toString('base64').replace(/[+/]/g, '').substring(0, length);
	const inuse = await Post.findOne({ id });
	id = (inuse ? await generatePostUID(length) : id);
	return id;
}
