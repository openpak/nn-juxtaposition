import express from 'express';
import moment from 'moment';
import xmlbuilder from 'xmlbuilder';
import Cache from '@/cache';
import { Post } from '@/models/post';
import { Community } from '@/models/community';
import { getDb } from '@/database';
import { ApiErrorCode, badRequest } from '@/errors';
import type { HydratedPostDocument } from '@/types/models/post';
import type { HydratedCommunityDocument } from '@/types/models/community';
import type { WWPResult, WWPTopic } from '@/types/miiverse/wara-wara-plaza';

const router = express.Router();
const ONE_HOUR = 60 * 60 * 1000;
const WARA_WARA_PLAZA_CACHE = new Cache<WWPResult>(ONE_HOUR);

/* GET post titles. */
router.get('/', async function (request: express.Request, response: express.Response): Promise<void> {
	response.type('application/xml');

	// * Commented out for now because we just don't
	// * need this data here. WWP does not use the
	// * current users data atm. Also some users have
	// * BOSS tasks with outdated tokens, which aren't
	// * usable and thus break this request. This is
	// * done as a quick/hacky fix around that
	// TODO - Re-enable this and filter out the current users posts
	// let user: GetUserDataResponse;
	//
	// try {
	//	user  = await getUserAccountData(request.pid);
	// } catch (error) {
	//	request.log.warn(error, `Failed to get account data for ${request.pid}`);
	//	return;
	// }
	//
	// let discovery: HydratedEndpointDocument | null;
	//
	// if (user) {
	//	discovery = await getEndpoint(user.serverAccessLevel);
	// } else {
	//	discovery = await getEndpoint('prod');
	// }
	//
	// if (!discovery || !discovery.topics) {
	//	response.sendStatus(404);
	//	return;
	// }

	if (!WARA_WARA_PLAZA_CACHE.valid()) {
		const communities = await calculateMostPopularCommunities(24, 10);

		if (communities.length < 10) {
			request.log.warn('Not enough communities exist for topics request');
			return badRequest(response, ApiErrorCode.NOT_FOUND_COMMUNITY, 404);
		}

		WARA_WARA_PLAZA_CACHE.update(await generateTopicsData(communities));
	}

	const result = WARA_WARA_PLAZA_CACHE.get() || {};
	const xml = xmlbuilder.create({
		result: result
	}, {
		separateArrayItems: true
	}).end({
		pretty: true,
		allowEmpty: true
	});

	response.set('Cache-Control', 'public, max-age=3600'); // * 1 hour
	response.send(xml);
});

async function generateTopicsData(communities: HydratedCommunityDocument[]): Promise<WWPResult> {
	const topics: {
		topic: WWPTopic;
	}[] = [];

	const seenPeople: number[] = [];

	for (let i = 0; i < communities.length; i++) {
		const community = communities[i];

		const empathies = await getDb().post.aggregate({
			where: { community_id: community.olive_community_id },
			_sum: { empathy_count: true }
		});

		const topic: WWPTopic = {
			empathy_count: empathies._sum.empathy_count || 0,
			has_shop_page: community.has_shop_page ? 1 : 0,
			icon: community.icon,
			title_ids: [],
			title_id: community.title_id[0],
			community_id: 0xFFFFFFFF, // * This is how it was in the real WWP. Unsure why, but it works
			is_recommended: community.is_recommended ? 1 : 0,
			name: community.name,
			people: [],
			position: i + 1
		};

		community.title_id.forEach((title_id) => {
			// * Just in case
			if (title_id) {
				topic.title_ids.push({ title_id });
			}
		});

		const people = await getCommunityPeople(community, seenPeople);

		for (const person of people) {
			const post = person.post.json({
				with_mii: true,
				topic_tag: true
			});

			post.community_id = 0xFFFFFFFF; // * Make this match above. This is how it was in the real WWP. Unsure why, but it works

			topic.people.push({
				person: {
					posts: [
						{
							post
						}
					]
				}
			});

			seenPeople.push(person._id);
		}

		topics.push({
			topic: topic
		});
	}

	return {
		has_error: 0,
		version: 1,
		expire: moment().add(2, 'days').format('YYYY-MM-DD HH:MM:SS'),
		request_name: 'topics',
		topics
	};
}

async function getCommunityPeople(community: HydratedCommunityDocument, seenPeople: number[], hours = 24): Promise<{ _id: number; post: HydratedPostDocument }[]> {
	const now = new Date();
	const last24Hours = new Date(now.getTime() - hours * 60 * 60 * 1000);
	// One post per person (the Mongo $group took whichever came first; this takes their newest)
	const posts = await Post.findNewestPerAuthor({
		title_id: {
			in: community.title_id
		},
		created_at: {
			gte: last24Hours
		},
		message_to_pid: null,
		parent: null,
		removed: false,
		pid: {
			// * Exclude people we have seen in other communities.
			// * This increases generation time, but ensures the
			// * max number of slots we can fill end up getting used
			notIn: seenPeople
		}
	}, 70); // * Arbitrary
	const people = posts.map(post => ({ _id: post.pid, post }));

	// TODO - Remove this check once out of beta and have more users
	// * We only do this because Juxtaposition is not super active
	// * due to it being in beta. If we don't expand the search
	// * time range then WWP still ends up fairly empty
	// *
	// * Ensure we have at *least* 20 people. Arbitrary.
	// * If the year is less than 2020, assume we've gone
	// * too far back. There are no more posts, just return
	// * what was found
	if (people.length < 20 && last24Hours.getFullYear() >= 2020) {
		// * Double the search range each time to get
		// * exponentially more posts. This speeds up
		// * the search at the cost of using older posts
		return getCommunityPeople(community, seenPeople, hours * 2);
	}

	return people;
}

async function calculateMostPopularCommunities(hours: number, limit: number): Promise<HydratedCommunityDocument[]> {
	const now = new Date();
	const last24Hours = new Date(now.getTime() - hours * 60 * 60 * 1000);

	if (!last24Hours) {
		throw new Error('Invalid date');
	}

	const validCommunities = await getDb().community.findMany({
		where: { type: 0, parent: null },
		select: { olive_community_id: true }
	});
	const communityIDs = validCommunities.map(c => c.olive_community_id);

	if (communityIDs.length === 0) {
		throw new Error('No communities found');
	}

	const popularCommunities = await getDb().post.groupBy({
		by: ['community_id'],
		where: {
			created_at: {
				gte: last24Hours
			},
			message_to_pid: null,
			community_id: {
				in: communityIDs
			}
		},
		_count: { _all: true },
		orderBy: { _count: { community_id: 'desc' } },
		take: limit
	});

	// Widen the window until enough communities had posts; stop once it reaches back before 2020
	// (the Mongo version kept doubling until the date was invalid)
	if (popularCommunities.length < limit && last24Hours.getFullYear() >= 2020) {
		return calculateMostPopularCommunities(hours + hours, limit);
	}

	return Community.find({
		olive_community_id: {
			in: popularCommunities.map(({ community_id }) => community_id)
		}
	});
}

export default router;
