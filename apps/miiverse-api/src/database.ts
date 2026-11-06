import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '@/logger';
import { Community } from '@/models/community';
import { Conversation } from '@/models/conversation';
import { Endpoint } from '@/models/endpoint';
import { Post } from '@/models/post';
import { config } from '@/config';
import { PrismaClient } from '@/prisma/client';
import type { User } from '@/prisma/client';
import type { HydratedEndpointDocument } from '@/models/endpoint';
import type { HydratedConversationDocument } from '@/models/conversation';
import type { HydratedPostDocument, IPostInput } from '@/types/models/post';
import type { HydratedCommunityDocument } from '@/types/models/community';
import type { UserWithSettingsAndFollows } from '@/services/internal/utils/user';

let prisma: PrismaClient | null = null;

export function getDb() {
	if (!prisma) {
		throw new Error('Prisma used before initialisation');
	}
	return prisma;
}

export async function setupPrisma() {
	const adapter = new PrismaPg({ connectionString: config.db.url });
	prisma = new PrismaClient({ adapter });

	try {
		await prisma.$connect();
		logger?.info('Connected to database!');
	} catch (err) {
		logger?.error(err, 'Failed to connect to database, continueing anyway!');
	}
}

export async function getMostPopularCommunities(limit: number): Promise<HydratedCommunityDocument[]> {
	// The Mongo query sorted by a `followers` field no community has; Postgres has no such column either
	return Community.find({ parent: null, type: 0 }, { take: limit });
}

export async function getNewCommunities(limit: number): Promise<HydratedCommunityDocument[]> {
	return Community.find({ parent: null, type: 0 }, { orderBy: { created_at: 'desc' }, take: limit });
}

export async function getSubCommunities(parentCommunityID: string): Promise<HydratedCommunityDocument[]> {
	return Community.find({ parent: parentCommunityID });
}

export async function getCommunityByTitleID(titleID: string): Promise<HydratedCommunityDocument | null> {
	return Community.findOne({ title_id: { has: titleID } });
}

export async function getCommunityByTitleIDs(titleIDs: string[]): Promise<HydratedCommunityDocument | null> {
	return Community.findOne({ title_id: { hasSome: titleIDs } });
}

export async function getCommunityByID(communityID: string): Promise<HydratedCommunityDocument | null> {
	return Community.findOne({ community_id: communityID });
}

export async function getPostByID(postID: string): Promise<HydratedPostDocument | null> {
	return Post.findOne({ id: postID });
}

export async function getPostReplies(postID: string, limit: number): Promise<HydratedPostDocument[]> {
	return Post.find({
		parent: postID,
		removed: false,
		app_data: { not: null }
	}, { take: limit });
}

export async function getDuplicatePosts(pid: number, post: IPostInput, olderThanMs: number): Promise<HydratedPostDocument | null> {
	return Post.findOne({
		pid: pid,
		body: post.body ?? '',
		screenshot: post.screenshot ?? null,
		painting: post.painting ?? null,
		created_at: {
			gte: new Date(Date.now() - olderThanMs)
		},
		parent: null,
		removed: false
	});
}

export async function getPostsBytitleID(titleID: string[], limit: number): Promise<HydratedPostDocument[]> {
	return Post.find({
		title_id: { in: titleID },
		parent: null,
		removed: false
	}, { orderBy: { created_at: 'desc' }, take: limit });
}

export async function getEndpoints(): Promise<HydratedEndpointDocument[]> {
	return Endpoint.findAll();
}

export async function getEndpoint(accessLevel: string): Promise<HydratedEndpointDocument | null> {
	return Endpoint.findByAccessLevel(accessLevel);
}

export async function getUser(pid: number): Promise<UserWithSettingsAndFollows | null> {
	return await getDb().user.findUnique({
		where: {
			pid
		},
		include: {
			settings: true,
			follows: true,
			followedCommunities: true
		}
	});
}

export async function getFollowedUsers(pid: number): Promise<User[]> {
	const follows = await getDb().userFollow.findMany({
		where: {
			pid
		},
		include: {
			followingUser: true
		}
	});
	return follows.map(v => v.followingUser);
}

export async function getFollowedUserPids(pid: number): Promise<number[]> {
	const follows = await getDb().userFollow.findMany({
		where: {
			pid
		},
		select: {
			followingPid: true
		}
	});
	return follows.map(v => v.followingPid);
}

export async function getConversationByUsers(pids: number[]): Promise<HydratedConversationDocument | null> {
	return Conversation.findByUsers(pids[0], pids[1]);
}

export async function getFriendMessages(pid: string, search_key: string[], limit: number): Promise<HydratedPostDocument[]> {
	return Post.find({
		message_to_pid: pid,
		search_key: { equals: search_key },
		parent: null,
		removed: false
	}, { orderBy: { created_at: 'asc' }, take: limit });
}
