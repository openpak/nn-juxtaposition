import { z } from 'zod';
import { Post } from '@/models/post';
import { errors } from '@/services/internal/errors';
import { deleteOptional, filterRemovedPosts } from '@/services/internal/utils';
import { guards } from '@/services/internal/middleware/guards';
import { getRelevantPidsFromPost, mapPost, mapPostWithModeration, postSchema } from '@/services/internal/contract/post';
import { mapPage, pageControlSchema, pageDtoSchema } from '@/services/internal/contract/page';
import { mapResult, resultSchema } from '@/services/internal/contract/result';
import { empathyActionSchema, empathySchema, mapEmpathy } from '@/services/internal/contract/empathy';
import { postIdObjSchema, postIdSchema } from '@/services/internal/schemas';
import { createInternalApiRouter } from '@/services/internal/builder/router';
import { standardSortSchema, standardSortToDirection } from '@/services/internal/contract/utils';
import { createLogEntry } from '@/services/internal/utils/auditLogs';
import { Community } from '@/models/community';
import { createNewPost, isValidPost, postCreateSchema } from '@/services/internal/utils/posts';
import { isPostingAllowed } from '@/services/internal/utils/communities';
import { mapSelf } from '@/services/internal/contract/self';
import { assertCanAccessUser, canAccessUser } from '@/services/internal/utils/user';
import { createNewEmpathyNotification, createNewReplyNotification } from '@/services/internal/utils/notifications';
import type { Prisma } from '@/prisma/client';

export const postsRouter = createInternalApiRouter();

postsRouter.get({
	path: '/posts',
	name: 'posts.list',
	description: 'Get posts by topic tag, poster, or empathy',
	guard: guards.guest,
	schema: {
		query: z.object({
			topic_tag: z.string().optional(),
			posted_by: z.coerce.number().optional(),
			empathy_by: z.coerce.number().optional(),
			parent_id: postIdSchema.optional(),
			include_replies: z.stringbool().default(false),
			sort: standardSortSchema
			// Increased page limit for replies
		}).extend(pageControlSchema(500)),
		response: pageDtoSchema(postSchema)
	},
	async handler({ query, auth, db }) {
		if (query.parent_id && !query.include_replies) {
			throw errors.for('bad_request', 'Please set include_replies=true to get replies to a parent');
		}
		// guests can view userpages, but not feeds (no topic tags etc.)
		if (auth === null && !query.posted_by && !query.empathy_by && !query.parent_id) {
			throw errors.for('requires_auth');
		}
		// Extra checks for user posts
		if (query.posted_by) {
			const user = await db.user.findUnique({
				where: {
					pid: query.posted_by
				},
				include: {
					settings: true
				}
			});
			// We can't see this user for some reason (doesn't exist, permission, etc)
			if (!user || !canAccessUser(auth, user)) {
				return mapPage(0, []);
			}
		}

		const dbQuery: Prisma.PostWhereInput = deleteOptional({
			pid: query.posted_by,
			topic_tag: query.topic_tag,
			yeahs: query.empathy_by !== undefined ? { has: query.empathy_by } : undefined,
			parent: query.parent_id,

			message_to_pid: null, // messages aren't really posts
			...query.include_replies ? {} : { parent: null },
			...filterRemovedPosts(auth)
		});

		const posts = await Post.find(dbQuery, {
			orderBy: { created_at: standardSortToDirection(query.sort) },
			skip: query.offset,
			take: query.limit
		});
		const total = await Post.count(dbQuery);

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
		return mapPage(total, mappedPosts);
	}
});

postsRouter.get({
	path: '/posts/:post_id',
	name: 'posts.get',
	guard: guards.guest,
	allowNotFound: true,
	schema: {
		params: postIdObjSchema,
		response: postSchema
	},
	async handler({ params, auth, db }) {
		const post = await Post.findOne({
			id: params.post_id,
			message_to_pid: null, // messages aren't really posts
			...filterRemovedPosts(auth)
		});
		if (!post) {
			throw errors.for('not_found');
		}
		const community = await Community.findOne({ olive_community_id: post.community_id });

		const users = await db.user.findMany({
			where: {
				pid: {
					in: getRelevantPidsFromPost([post])
				}
			}
		});

		const poster = await db.user.findUnique({
			where: {
				pid: post.pid
			},
			include: {
				settings: true
			}
		});
		if (!poster) {
			throw errors.for('not_found');
		}
		// Throws if user isn't visible for some reason
		assertCanAccessUser(auth, poster);

		if (auth?.moderator) {
			return mapPostWithModeration(post, community, users);
		}
		return mapPost(post, community, users);
	}
});

postsRouter.delete({
	path: '/posts/:post_id',
	name: 'posts.delete',
	guard: guards.user,
	schema: {
		params: postIdObjSchema,
		query: z.object({
			// Reason is only for moderators
			reason: z.string().optional()
		}),
		response: resultSchema
	},
	async handler({ query, params, auth }) {
		const post = await Post.findOne({
			id: params.post_id,
			message_to_pid: null, // messages aren't really posts
			...filterRemovedPosts(auth)
		});
		if (!post) {
			throw errors.for('not_found');
		}

		// guards.user makes this safe
		const account = auth!;

		let reason = 'User requested removal';
		if (post.pid !== account.pnid.pid) {
			if (account.moderator) {
				// If a moderator deletes someone else's post, they can provide a reason
				reason = query.reason ?? 'Removed by moderator';
				await createLogEntry({
					actorId: account.pnid.pid,
					action: 'REMOVE_POST',
					targetResourceId: post.pid.toString(),
					context: `Post ${post.id} removed for: "${reason}"`
				});
			} else {
				// Non-moderators can't delete other posts
				throw errors.for('forbidden', 'Not your post');
			}
		}

		await post.del(reason, account.pnid.pid);

		if (post.parent) {
			await Post.incrementReplies(post.parent, -1);
		}

		return mapResult('success');
	}
});

postsRouter.post({
	path: '/posts/:post_id/empathies',
	name: 'posts.changeEmpathy',
	description: 'Add or remove empathy for current user',
	guard: guards.user,
	schema: {
		params: postIdObjSchema,
		body: z.object({
			action: empathyActionSchema
		}),
		response: empathySchema
	},
	async handler({ body, params, auth, db }) {
		let post = await Post.findOne({
			id: params.post_id,
			message_to_pid: null, // messages aren't really posts
			...filterRemovedPosts(auth)
		});
		if (!post) {
			throw errors.for('not_found');
		}

		// guards.user makes this safe
		const account = auth!;
		const pid = account.pnid.pid;

		/* One conditional UPDATE each way keeps empathy_count and yeahs in step under concurrent
		 * requests; null (answered as not_found, as before) when the yeah was already there / not there */
		if (body.action === 'add') {
			post = await Post.addEmpathy(post.id, pid);
		} else {
			post = await Post.removeEmpathy(post.id, pid);
		}
		if (!post) {
			throw errors.for('not_found');
		}

		const targetUser = await db.user.findUnique({
			where: {
				pid: post.pid
			},
			include: {
				settings: true
			}
		});
		if (targetUser && pid !== targetUser.pid && targetUser.settings?.notifyEmpathy) {
			await createNewEmpathyNotification(db, { currentUser: pid, postAuthor: post.pid, postId: post.id });
		}

		return mapEmpathy(body.action, post);
	}
});

postsRouter.post({
	path: '/posts/:post_id/report',
	name: 'posts.report',
	guard: guards.user,
	schema: {
		params: postIdObjSchema,
		body: z.object({
			reasonId: z.number(),
			message: z.string()
		}),
		response: resultSchema
	},
	async handler({ body, params, auth, db }) {
		// guards.user makes this safe
		const account = auth!;
		const pid = account.pnid.pid;

		const post = await Post.findOne({
			id: params.post_id,
			message_to_pid: null, // messages aren't really posts
			removed: false
		});
		if (!post) {
			throw errors.for('not_found');
		}

		const duplicateReport = await db.report.findFirst({
			where: {
				reported_by: pid,
				post_id: post.id
			}
		});
		if (duplicateReport) {
			return mapResult('success'); // Silently reject duplicate reports
		}

		await db.report.create({
			data: {
				pid: post.pid,
				reported_by: pid,
				post_id: post.id,
				reason: body.reasonId,
				message: body.message
			}
		});

		return mapResult('success');
	}
});

postsRouter.post({
	path: '/posts/:post_id/edit/spoiler',
	name: 'posts.changeSpoiler',
	description: 'Change spoiler for post',
	guard: guards.moderator,
	schema: {
		params: postIdObjSchema,
		body: z.object({
			is_spoiler: z.boolean()
		}),
		response: resultSchema
	},
	async handler({ params, body, auth }) {
		const post = await Post.findOne({
			id: params.post_id,
			message_to_pid: null, // messages aren't really posts
			...filterRemovedPosts(auth)
		});
		if (!post) {
			throw errors.for('not_found');
		}

		await Post.updateMany({ id: post.id }, { is_spoiler: body.is_spoiler ? 1 : 0 });

		return mapResult('success');
	}
});

postsRouter.post({
	path: '/posts/:post_id/replies',
	name: 'posts.reply',
	guard: guards.user,
	schema: {
		params: postIdObjSchema,
		body: postCreateSchema,
		response: postSchema
	},
	async handler({ body, params, auth, db }) {
		const account = auth!;
		const pid = account.pnid.pid;

		const parentPost = await Post.findOne({
			id: params.post_id,
			message_to_pid: null,
			removed: false
		});
		if (!parentPost) {
			throw errors.for('not_found');
		}
		if (parentPost.parent) {
			throw errors.for('bad_request');
		}

		const community = await Community.findOne({ olive_community_id: parentPost.community_id });
		if (!community) {
			throw errors.for('not_found');
		}

		const self = mapSelf(account);
		if (!isPostingAllowed(community, self, parentPost)) {
			throw errors.for('forbidden');
		}

		if (!isValidPost(body)) {
			throw errors.for('invalid_post');
		}
		const newPost = await createNewPost({
			author: {
				pid,
				verified: self.permissions.moderator
			},
			body,
			community,
			parentPost
		});
		const users = await db.user.findMany({
			where: {
				pid: {
					in: getRelevantPidsFromPost([newPost])
				}
			}
		});

		const targetUser = await db.user.findUnique({
			where: {
				pid: parentPost.pid
			},
			include: {
				settings: true
			}
		});
		if (targetUser && pid !== targetUser.pid && targetUser.settings?.notifyReply) {
			await createNewReplyNotification(db, { reply: newPost, replyToUser: targetUser.pid });
		}

		return mapPost(newPost, community, users);
	}
});
