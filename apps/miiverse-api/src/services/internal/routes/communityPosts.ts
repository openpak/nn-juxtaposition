import { z } from 'zod';
import { Post } from '@/models/post';
import { deleteOptional, filterRemovedPosts } from '@/services/internal/utils';
import { guards } from '@/services/internal/middleware/guards';
import { getRelevantPidsFromPost, mapPost, mapPostWithModeration, postSchema } from '@/services/internal/contract/post';
import { feedPageDtoSchema, mapFeedPage, pageControlSchema } from '@/services/internal/contract/page';
import { createInternalApiRouter } from '@/services/internal/builder/router';
import { Community } from '@/models/community';
import { createNewPost, isValidPost, postCreateSchema } from '@/services/internal/utils/posts';
import { errors } from '@/services/internal/errors';
import { expandFamily, familyMemberIds, isPostingAllowed } from '@/services/internal/utils/communities';
import { mapSelf } from '@/services/internal/contract/self';
import { CONSOLE_SHARE_ROOM, switchTitleIdForms } from '@/services/console-share/console-share';

export const communityPostsRouter = createInternalApiRouter();

communityPostsRouter.get({
	path: '/communities/:id/feed/fresh',
	name: 'communities.feed.getFresh',
	guard: guards.guest,
	schema: {
		params: z.object({
			id: z.string()
		}),
		query: z.object(pageControlSchema()),
		response: feedPageDtoSchema(postSchema)
	},
	async handler({ params, query, auth, db }) {
		const ids = await expandFamily(params.id);
		const posts = await Post.find(deleteOptional({
			community_id: ids.length === 1 ? ids[0] : { in: ids },
			parent: null,
			message_to_pid: null, // messages aren't really posts
			...filterRemovedPosts(auth)
		}), { orderBy: { created_at: 'desc' }, skip: query.offset, take: query.limit });

		const communityIds = posts.map(v => v.community_id);
		const communities = await Community.find({ olive_community_id: { in: communityIds } });

		const users = await db.user.findMany({
			where: {
				pid: {
					in: getRelevantPidsFromPost(posts)
				}
			}
		});

		const mappedPosts = posts.map((p) => {
			const comm = communities.find(v => v.olive_community_id === p.community_id) ?? null;

			if (auth?.moderator) {
				return mapPostWithModeration(p, comm, users);
			}
			return mapPost(p, comm, users);
		});
		return mapFeedPage(mappedPosts);
	}
});

communityPostsRouter.get({
	path: '/communities/:id/feed/popular',
	name: 'communities.feed.getPopular',
	guard: guards.guest,
	schema: {
		params: z.object({
			id: z.string()
		}),
		query: z.object(pageControlSchema()),
		response: feedPageDtoSchema(postSchema)
	},
	async handler({ params, query, auth, db }) {
		const ids = await expandFamily(params.id);
		const posts = await Post.find(deleteOptional({
			community_id: ids.length === 1 ? ids[0] : { in: ids },
			parent: null,
			...filterRemovedPosts(auth)
		}), { orderBy: { empathy_count: 'desc' }, skip: query.offset, take: query.limit });

		const communityIds = posts.map(v => v.community_id);
		const communities = await Community.find({ olive_community_id: { in: communityIds } });

		const users = await db.user.findMany({
			where: {
				pid: {
					in: getRelevantPidsFromPost(posts)
				}
			}
		});

		const mappedPosts = posts.map((p) => {
			const comm = communities.find(v => v.olive_community_id === p.community_id) ?? null;

			if (auth?.moderator) {
				return mapPostWithModeration(p, comm, users);
			}
			return mapPost(p, comm, users);
		});
		return mapFeedPage(mappedPosts);
	}
});

communityPostsRouter.post({
	path: '/communities/:id/posts',
	name: 'communities.createPost',
	guard: guards.user,
	schema: {
		params: z.object({
			id: z.string()
		}),
		body: postCreateSchema,
		response: postSchema
	},
	async handler({ body, params, auth, db }) {
		const account = auth!;

		const community = await Community.findOne({ olive_community_id: params.id });
		if (!community) {
			throw errors.for('not_found');
		}

		const self = mapSelf(account);
		if (!isPostingAllowed(community, self, null) || (await familyMemberIds(community.olive_community_id)).length > 0) {
			throw errors.for('forbidden'); // a family page has no posts of its own: posts go to one of its games
		}

		if (!isValidPost(body)) {
			throw errors.for('invalid_post');
		}
		const newPost = await createNewPost({
			author: {
				pid: account.pnid.pid,
				verified: self.permissions.moderator
			},
			body,
			community,
			parentPost: null
		});
		const users = await db.user.findMany({
			where: {
				pid: {
					in: getRelevantPidsFromPost([newPost])
				}
			}
		});

		return mapPost(newPost, community, users);
	}
});

/* A screenshot shared from the Switch Album (Album -> Post). nx-share proves the console user,
 * resolves their OpenVerse identity (sso.resolve) and calls this as that user (x-trusted-pid),
 * so bans, read-only (supervised) accounts, community permissions, automod and the duplicate
 * check all apply as they do to any post. The screenshot is the console's own capture, already
 * scaled by nx-share to the 800x450 OpenVerse keeps. It goes to the game's community when one
 * has the Switch title id, otherwise to the Switch room, and carries the game's name. */
communityPostsRouter.post({
	path: '/console-share/posts',
	name: 'consoleShare.createPost',
	description: 'Create a screenshot post shared from the Switch Album',
	guard: guards.user,
	schema: {
		body: z.object({
			titleId: z.string().regex(/^([0-9A-F]{16})?$/),
			titleName: z.string().max(128).default(''),
			body: z.string().trim().optional(),
			isSpoiler: z.boolean().default(false),
			screenshot: z.base64()
		}),
		response: postSchema
	},
	async handler({ body, auth, db }) {
		const account = auth!;
		const forms = switchTitleIdForms(body.titleId);
		let community = forms.length > 0 ? await Community.findOne({ title_id: { hasSome: forms } }) : null;
		if (!community) {
			community = await Community.findOne({ name: CONSOLE_SHARE_ROOM });
		}
		if (!community) {
			throw errors.for('not_found');
		}

		const self = mapSelf(account);
		if (!isPostingAllowed(community, self, null)) {
			throw errors.for('forbidden');
		}

		const newPost = await createNewPost({
			author: {
				pid: account.pnid.pid,
				verified: self.permissions.moderator
			},
			body: {
				body: body.body,
				feelingId: 0,
				isSpoiler: body.isSpoiler,
				isAppJumpable: false,
				screenshot: { file: body.screenshot, titleId: body.titleId }
			},
			community,
			parentPost: null,
			consoleShare: { titleId: body.titleId, titleName: body.titleName }
		});
		const users = await db.user.findMany({
			where: {
				pid: {
					in: getRelevantPidsFromPost([newPost])
				}
			}
		});

		return mapPost(newPost, community, users);
	}
});
