import { z } from 'zod';
import { Post } from '@/models/post';
import { deleteOptional, filterRemovedPosts } from '@/services/internal/utils';
import { guards } from '@/services/internal/middleware/guards';
import { getRelevantPidsFromPost, mapPost, mapPostWithModeration, postSchema } from '@/services/internal/contract/post';
import { mapPage, pageControlSchema, pageDtoSchema } from '@/services/internal/contract/page';
import { createInternalApiRouter } from '@/services/internal/builder/router';
import { canAccessUser } from '@/services/internal/utils/user';
import { getPostTypeFilter, postTypeFilter, standardSortSchema, standardSortToDirection } from '@/services/internal/contract/utils';
import { Community } from '@/models/community';
import type { Prisma } from '@/prisma/client';
import type { IPost } from '@/types/models/post';

export const userPostsRouter = createInternalApiRouter();

userPostsRouter.get({
	path: '/users/:id/posts',
	name: 'users.posts.list',
	guard: guards.guest,
	schema: {
		params: z.object({
			id: z.coerce.number()
		}),
		query: z.object({
			removed: z.stringbool().optional(),
			type: postTypeFilter.default('post'),
			sort: standardSortSchema,
			sortBy: z.enum(['createdAt', 'removedAt']).default('createdAt')
		}).extend(pageControlSchema()),
		response: pageDtoSchema(postSchema)
	},
	async handler({ params, query, auth, db }) {
		const pid = params.id;
		const user = await db.user.findUnique({
			where: {
				pid
			},
			include: {
				settings: true
			}
		});
		// We can't see this user for some reason (doesn't exist, permission, etc)
		if (!user || !canAccessUser(auth, user)) {
			return mapPage(0, []);
		}

		const dbQuery: Prisma.PostWhereInput = deleteOptional({
			pid,
			removed: query.removed,
			message_to_pid: null, // messages aren't really posts
			...getPostTypeFilter(query.type),
			...filterRemovedPosts(auth)
		});
		const sortKey: keyof IPost = query.sortBy === 'removedAt' ? 'removed_at' : 'created_at';
		const direction = standardSortToDirection(query.sort);
		const posts = await Post.find(dbQuery, {
			// Mongo put a missing removed_at first going up and last going down; so does this
			orderBy: sortKey === 'removed_at'
				? { removed_at: { sort: direction, nulls: direction === 'asc' ? 'first' : 'last' } }
				: { created_at: direction },
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
