import express from 'express';
import xmlbuilder from 'xmlbuilder';
import moment from 'moment';
import { getFollowedUsers, getUser, getFollowedUserPids } from '@/database';
import { getValueFromQueryString, getUserFriendPIDs } from '@/util';
import { Post } from '@/models/post';
import { ApiErrorCode, badRequest } from '@/errors';
import { userToOliveUser } from '@/services/internal/utils';
import type { Prisma } from '@/prisma/client';
import type { HydratedPostDocument } from '@/types/models/post';
import type { PeopleFollowingResult, PeoplePostsResult } from '@/types/miiverse/people';

const router = express.Router();

/* GET post titles. */
router.get('/', async function (request: express.Request, response: express.Response): Promise<void> {
	response.type('application/xml');

	const query: Prisma.PostWhereInput = {
		removed: false,
		is_spoiler: 0,
		app_data: null,
		parent: null,
		message_to_pid: null
	};

	const relation = getValueFromQueryString(request.query, 'relation')[0];
	const distinctPID = getValueFromQueryString(request.query, 'distinct_pid')[0];
	const limitString = getValueFromQueryString(request.query, 'limit')[0];
	const withMii = getValueFromQueryString(request.query, 'with_mii')[0];

	let limit = 10;

	if (limitString) {
		limit = parseInt(limitString);
	}

	if (isNaN(limit)) {
		limit = 10;
	}

	if (relation === 'friend') {
		query.pid = { in: await getUserFriendPIDs(request.pid) };
	} else if (relation === 'following') {
		const followedUsers = await getFollowedUserPids(request.pid);
		query.pid = { in: followedUsers };
	} else if (request.query.pid) {
		const pidInputs = getValueFromQueryString(request.query, 'pid');
		const pids = pidInputs.map(pid => Number(pid)).filter(pid => !isNaN(pid));

		query.pid = { in: pids };
	}

	let posts: HydratedPostDocument[];

	if (distinctPID === '1') {
		posts = await Post.findNewestPerAuthor(query, limit); // one post per author, the newest
	} else if (request.query.is_hot === '1') {
		posts = await Post.find(query, { orderBy: { empathy_count: 'desc' }, take: limit });
	} else {
		posts = await Post.find(query, { orderBy: { created_at: 'desc' }, take: limit });
	}

	const result: PeoplePostsResult = {
		has_error: 0,
		version: 1,
		expire: moment().add(1, 'days').format('YYYY-MM-DD HH:MM:SS'),
		request_name: 'posts',
		people: []
	};

	for (const post of posts) {
		result.people.push({
			person: {
				posts: [
					{
						post: post.json({
							with_mii: withMii === '1',
							topic_tag: true
						})
					}
				]
			}
		});
	}

	response.send(xmlbuilder.create({
		result
	}, {
		separateArrayItems: true
	}).end({
		pretty: true,
		allowEmpty: true
	}));
});

router.get('/:pid/following', async function (request: express.Request, response: express.Response): Promise<void> {
	response.type('application/xml');

	const pid = parseInt(request.params.pid);

	if (isNaN(pid)) {
		return badRequest(response, ApiErrorCode.NOT_FOUND, 404);
	}

	const user = await getUser(pid);
	if (!user) {
		return badRequest(response, ApiErrorCode.NOT_FOUND, 404);
	}

	const people = await getFollowedUsers(pid);

	const result: PeopleFollowingResult = {
		has_error: 0,
		version: 1,
		request_name: 'user_infos',
		people: []
	};

	for (const person of people) {
		result.people.push({
			person: userToOliveUser(person)
		});
	}

	response.send(xmlbuilder.create({
		result
	}, {
		separateArrayItems: true
	}).end({
		pretty: true,
		allowEmpty: true
	}));
});

export default router;
