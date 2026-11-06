import { z } from 'zod';
import { createInternalApiRouter } from '@/services/internal/builder/router';
import { standardSortSchema, standardSortToDirection } from '@/services/internal/contract/utils';
import { guards } from '@/services/internal/middleware/guards';
import { mapPage, pageControlSchema, pageDtoSchema } from '@/services/internal/contract/page';
import { Community } from '@/models/community';
import { deleteOptional } from '@/services/internal/utils';
import { COMMUNITY_TYPE } from '@/types/models/community';
import { categoryToCommunityTypes, communityCategory, communitySchema, communityStatsSchema, mapCommunity, mapCommunityStats } from '@/services/internal/contract/community';
import { expandFamily } from '@/services/internal/utils/communities';
import { errors } from '@/services/internal/errors';
import { Post } from '@/models/post';
import { listDtoSchema, mapList } from '@/services/internal/contract/list';
import { followSchema, mapFollowCommunity } from '@/services/internal/contract/follow';
import { getDb } from '@/database';
import type { Prisma } from '@/prisma/client';

const popularRangeMs = 24 * 60 * 60 * 1000; // 24h

export const communitiesRouter = createInternalApiRouter();

communitiesRouter.get({
	path: '/communities',
	name: 'communities.list',
	guard: guards.guest,
	schema: {
		query: z.object({
			sort: standardSortSchema,
			parent_id: z.string().optional(),
			category: communityCategory.optional()
		}).extend(pageControlSchema(90)),
		response: pageDtoSchema(communitySchema)
	},
	async handler({ query, auth, db }) {
		const typesToFilter: Prisma.CommunityWhereInput = auth?.moderator
			? {}
			: {
					type: {
						not: COMMUNITY_TYPE.Private
					}
				};
		if (query.category) {
			let typeList = categoryToCommunityTypes(query.category);
			if (!auth?.moderator) {
				typeList = typeList.filter(v => v !== COMMUNITY_TYPE.Private);
			}
			typesToFilter.type = { in: typeList };
		}

		const dbQuery: Prisma.CommunityWhereInput = deleteOptional({
			parent: query.parent_id,
			...typesToFilter
		});
		const communities = await Community.find(dbQuery, {
			orderBy: { created_at: standardSortToDirection(query.sort) },
			skip: query.offset,
			take: query.limit
		});
		const total = await Community.count(dbQuery);

		const ids = communities.map(v => v.olive_community_id);
		const followers = await db.communityFollow.groupBy({
			by: ['communityId'],
			_count: true,
			where: {
				communityId: {
					in: ids
				}
			}
		});

		return mapPage(total, communities.map(c => mapCommunity(c, followers.find(v => v.communityId === c.olive_community_id)?._count ?? 0)));
	}
});

communitiesRouter.get({
	path: '/communities/popular',
	name: 'communities.listPopular',
	guard: guards.guest,
	schema: {
		query: z.object({
			limit: z.coerce.number().max(32).default(9)
		}),
		response: listDtoSchema(communitySchema)
	},
	async handler({ query, db }) {
		// TODO add caching
		const popularCommunityIds = await calculateMostPopularCommunities(popularRangeMs);
		const rank = new Map(popularCommunityIds.map((id, i) => [id, i]));
		const popularCommunities = (await Community.find({
			type: { in: [COMMUNITY_TYPE.Main, COMMUNITY_TYPE.Announcement] },
			olive_community_id: { in: popularCommunityIds }
		}))
			.sort((a, b) => rank.get(a.olive_community_id)! - rank.get(b.olive_community_id)!)
			.slice(0, query.limit);

		const ids = popularCommunities.map(v => v.olive_community_id);
		const followers = await db.communityFollow.groupBy({
			by: ['communityId'],
			_count: true,
			where: {
				communityId: {
					in: ids
				}
			}
		});

		return mapList(popularCommunities.map(c => mapCommunity(c, followers.find(v => v.communityId === c.olive_community_id)?._count ?? 0)));
	}
});

communitiesRouter.get({
	path: '/communities/:id/stats',
	name: 'communities.getStats',
	guard: guards.guest,
	allowNotFound: true,
	schema: {
		params: z.object({
			id: z.string()
		}),
		response: communityStatsSchema
	},
	async handler({ params, auth }) {
		const typesToFilter: Prisma.CommunityWhereInput = auth?.moderator
			? {}
			: {
					type: {
						not: COMMUNITY_TYPE.Private
					}
				};

		const community = await Community.findOne(deleteOptional({
			olive_community_id: params.id,
			...typesToFilter
		}));
		if (!community) {
			throw errors.for('not_found');
		}

		const totalPosts = await Post.count({
			community_id: { in: await expandFamily(community.olive_community_id) },
			parent: null,
			removed: false
		});

		return mapCommunityStats(community, totalPosts);
	}
});

communitiesRouter.get({
	path: '/communities/:id',
	name: 'communities.get',
	guard: guards.guest,
	allowNotFound: true,
	schema: {
		params: z.object({
			id: z.string().openapi({ description: 'A community ID or a title ID starting with `tid:`' })
		}),
		response: communitySchema
	},
	async handler({ params, auth, db }) {
		let titleId: undefined | string = undefined;
		let communityId: undefined | string = params.id;
		if (params.id.startsWith('tid:')) {
			communityId = undefined;
			titleId = params.id.slice(4);
		}

		const typesToFilter: Prisma.CommunityWhereInput = auth?.moderator
			? {}
			: {
					type: {
						not: COMMUNITY_TYPE.Private
					}
				};

		const community = await Community.findOne(deleteOptional({
			olive_community_id: communityId,
			title_id: titleId !== undefined ? { has: titleId } : undefined,
			...typesToFilter
		}));
		if (!community) {
			throw errors.for('not_found');
		}

		const followers = await db.communityFollow.count({
			where: {
				communityId: community.olive_community_id
			}
		});

		return mapCommunity(community, followers);
	}
});

communitiesRouter.post({
	path: '/communities/:id/followers/@me',
	name: 'communities.follow',
	guard: guards.user,
	schema: {
		params: z.object({
			id: z.string()
		}),
		response: followSchema
	},
	async handler({ params, auth, db }) {
		const communityId = params.id;
		const currentUser = auth!;

		const typesToFilter: Prisma.CommunityWhereInput = auth?.moderator
			? {}
			: {
					type: {
						not: COMMUNITY_TYPE.Private
					}
				};

		const community = await Community.findOne(deleteOptional({
			olive_community_id: communityId,
			...typesToFilter
		}));
		if (!community) {
			throw errors.for('not_found');
		}
		const followCount = await db.communityFollow.count({
			where: {
				communityId
			}
		});

		const existingFollow = await db.communityFollow.findFirst({
			where: {
				pid: currentUser.pnid.pid,
				communityId
			}
		});
		if (existingFollow) {
			return mapFollowCommunity('follow', community, followCount);
		}

		await db.communityFollow.create({
			data: {
				pid: currentUser.pnid.pid,
				communityId
			}
		});

		return mapFollowCommunity('follow', community, followCount + 1);
	}
});

communitiesRouter.delete({
	path: '/communities/:id/followers/@me',
	name: 'communities.unfollow',
	guard: guards.user,
	schema: {
		params: z.object({
			id: z.string()
		}),
		response: followSchema
	},
	async handler({ params, auth, db }) {
		const communityId = params.id;
		const currentUser = auth!;

		const typesToFilter: Prisma.CommunityWhereInput = auth?.moderator
			? {}
			: {
					type: {
						not: COMMUNITY_TYPE.Private
					}
				};

		const community = await Community.findOne(deleteOptional({
			olive_community_id: communityId,
			...typesToFilter
		}));
		if (!community) {
			throw errors.for('not_found');
		}
		const followCount = await db.communityFollow.count({
			where: {
				communityId
			}
		});

		const existingFollow = await db.communityFollow.findFirst({
			where: {
				pid: currentUser.pnid.pid,
				communityId
			}
		});
		if (!existingFollow) {
			return mapFollowCommunity('unfollow', community, followCount);
		}

		await db.communityFollow.delete({
			where: {
				pid_communityId: {
					pid: currentUser.pnid.pid,
					communityId
				}
			}
		});
		return mapFollowCommunity('unfollow', community, followCount - 1);
	}
});

async function calculateMostPopularCommunities(rangeMs: number): Promise<string[]> {
	const now = new Date();
	const last24Hours = new Date(now.getTime() - rangeMs);

	const counts = await getDb().post.groupBy({
		by: ['community_id'],
		where: { created_at: { gte: last24Hours }, message_to_pid: null, community_id: { not: '' } },
		_count: { _all: true },
		orderBy: { _count: { community_id: 'desc' } }
	});
	return counts.map(c => c.community_id);
}
