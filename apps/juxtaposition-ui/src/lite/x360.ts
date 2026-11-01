/* Read-only OpenVerse feed for the OpenPak Xbox 360 dashboard (the stock dashboard has no usable
 * browser). Same device-token model as the browser pages: the dashboard asks for a link code,
 * shows it, and the person approves it at verse.openpak.org/devices. Documented in docs/lite.md.
 *
 *   POST /x360/v1/link/start             -> { code, poll_secret, ... }
 *   POST /x360/v1/link/poll              -> { status, token? }
 *   GET  /x360/v1/me | /feed | /communities | /communities/:id/posts | /posts/:id | /activity
 *
 * JSON by default; XML with ?format=xml or Accept: application/xml. Auth: Authorization: Bearer <token>. */

import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '@/config';
import { logger } from '@/logger';
import { InternalApiError, wrapApi } from '@/api/errors';
import { parseBearer } from '@/lite/auth';
import { displayCode, normalizeCode, pollCode, startLink } from '@/lite/linkCodes';
import { loadSession } from '@/lite/session';
import { localImage } from '@/lite/images';
import type { Request, Response, Router } from 'express';
import type { Community, Post } from '@/api/generated';
import type { LiteDeps } from '@/lite/router';
import type { LiteSession } from '@/lite/auth';

// ---- shapes ----------------------------------------------------------------------------------------

export type FeedPost = {
	id: string;
	created_at: string;
	community: { id: string; name: string } | null;
	author: { name: string };
	body: string;
	drawing_url: string | null;
	yeahs: number;
	replies: number;
	parent_id: string | null;
};

export type FeedCommunity = { id: string; name: string; description: string; followers: number };

export function mapPost(post: Post, origin: string): FeedPost {
	const img = localImage(post.painting?.imageUrl);
	return {
		id: post.id,
		created_at: new Date(post.createdAt).toISOString(),
		community: post.community ? { id: post.community.olive_community_id, name: post.community.name } : null,
		author: { name: post.author.miiName || 'OpenPak player' },
		body: post.body ?? '',
		drawing_url: img ? origin + img : null,
		yeahs: post.stats.empathyCount,
		replies: post.stats.replyCount,
		parent_id: post.parentId
	};
}

export function mapCommunity(c: Community): FeedCommunity {
	return { id: c.olive_community_id, name: c.name, description: c.description, followers: c.followerCount };
}

// ---- XML ---------------------------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex -- XML 1.0 forbids these characters
const XML_BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

export function xmlEsc(v: unknown): string {
	return String(v ?? '')
		.replace(XML_BAD, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Singular element name for each array key. */
const ITEM_NAMES: Record<string, string> = { posts: 'post', communities: 'community', replies_list: 'reply' };

/** Plain JSON-shaped data to XML: objects become elements, arrays repeat the singular name, null is an empty element. */
export function toXml(rootName: string, value: unknown): string {
	const walk = (name: string, v: unknown): string => {
		if (v === null || v === undefined) {
			return `<${name}/>`;
		}
		if (Array.isArray(v)) {
			const item = ITEM_NAMES[name] ?? 'item';
			return `<${name}>${v.map(x => walk(item, x)).join('')}</${name}>`;
		}
		if (typeof v === 'object') {
			return `<${name}>${Object.entries(v as Record<string, unknown>).map(([k, x]) => walk(k, x)).join('')}</${name}>`;
		}
		return `<${name}>${xmlEsc(v)}</${name}>`;
	};
	return `<?xml version="1.0" encoding="utf-8"?>\n${walk(rootName, value)}\n`;
}

export function wantsXml(req: Pick<Request, 'query' | 'get'>): boolean {
	if (req.query.format === 'xml') {
		return true;
	}
	if (req.query.format === 'json') {
		return false;
	}
	return /xml/i.test(req.get('accept') ?? '') && !/json/i.test(req.get('accept') ?? '');
}

// ---- router ------------------------------------------------------------------------------------------

function limits(req: Request): { limit: number; offset: number } {
	const l = Number.parseInt(String(req.query.limit ?? '10'), 10);
	const o = Number.parseInt(String(req.query.offset ?? '0'), 10);
	return {
		limit: Number.isInteger(l) && l >= 1 ? Math.min(l, 25) : 10,
		offset: Number.isInteger(o) && o >= 0 && o <= 5000 ? o : 0
	};
}

export function createX360Router(deps: LiteDeps): Router {
	const router = express.Router();
	router.use(express.json({ limit: '4kb' }));
	router.use(express.urlencoded({ extended: false, limit: '4kb' }));
	router.use(rateLimit({
		windowMs: 60 * 1000, limit: 120, standardHeaders: false, legacyHeaders: false, handler: (_req, res) => {
			res.status(429).json({ error: 'rate_limited' });
		}
	}));
	const startLimit = rateLimit({
		windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: false, legacyHeaders: false, handler: (_req, res) => {
			res.status(429).json({ error: 'rate_limited' });
		}
	});

	const send = (req: Request, res: Response, root: string, data: unknown, status = 200): void => {
		res.status(status).set('Cache-Control', 'no-store');
		if (wantsXml(req)) {
			res.type('application/xml; charset=utf-8').send(toXml(root, data));
		} else {
			res.type('application/json; charset=utf-8').send(JSON.stringify(data));
		}
	};

	const origin = (req: Request): string => `http://${req.get('host') ?? config.lite.hosts.split(',')[0]!.trim()}`;

	router.post('/link/start', startLimit, async (req, res) => {
		const started = await startLink(deps.kv, { deviceClass: 'x360', ip: req.ip ?? '' });
		send(req, res, 'link', {
			code: started.code,
			display_code: displayCode(started.code),
			poll_secret: started.secret,
			approve_url: config.lite.approveUrl,
			expires_in: 600,
			poll_every: 5
		});
	});

	router.post('/link/poll', startLimit, async (req, res) => {
		const code = normalizeCode(req.body?.code);
		const secret = typeof req.body?.secret === 'string' ? req.body.secret : '';
		if (!code || !secret) {
			send(req, res, 'link', { error: 'bad_request' }, 400);
			return;
		}
		const polled = await pollCode(deps.kv, code, secret, req.ip ?? '');
		if (polled.status === 'gone') {
			send(req, res, 'link', { status: 'expired' });
			return;
		}
		if (polled.status === 'pending') {
			send(req, res, 'link', { status: 'pending' });
			return;
		}
		const created = await wrapApi(deps.makeApi({}).deviceLinks.create({ accountId: polled.accountId, deviceClass: 'x360' }));
		if (!created.result) {
			send(req, res, 'link', { status: 'error', error: 'too_many_devices' }, 409);
			return;
		}
		send(req, res, 'link', { status: 'approved', token: created.result.token });
	});

	const authed = (handler: (req: Request, res: Response, s: LiteSession) => Promise<void>) =>
		async (req: Request, res: Response): Promise<void> => {
			try {
				const r = await loadSession(deps, parseBearer(req.get('authorization')), ['x360']);
				if (r.kind === 'none') {
					res.set('WWW-Authenticate', 'Bearer realm="OpenVerse"');
					send(req, res, 'error', { error: 'unauthorized' }, 401);
					return;
				}
				if (r.kind === 'unavailable') {
					send(req, res, 'error', { error: r.reason === 'banned' ? 'account_unavailable' : 'not_set_up' }, 403);
					return;
				}
				await handler(req, res, r.session);
			} catch (e) {
				if (e instanceof InternalApiError && e.status === 404) {
					send(req, res, 'error', { error: 'not_found' }, 404);
					return;
				}
				logger.error(e, 'x360 feed request failed');
				send(req, res, 'error', { error: 'server_error' }, 500);
			}
		};

	router.get('/me', authed(async (req, res, s) => {
		send(req, res, 'me', { display_name: s.self.miiName, read_only: true, device: 'x360' });
	}));

	router.get('/communities', authed(async (req, res, s) => {
		const { limit, offset } = limits(req);
		const { data } = await s.api.communities.list({ category: 'listed', sort: 'newest', limit, offset });
		send(req, res, 'communities', {
			communities: data.items.map(mapCommunity),
			total: data.total,
			next_offset: offset + data.items.length < data.total ? offset + data.items.length : null
		});
	}));

	router.get('/communities/:id/posts', authed(async (req, res, s) => {
		const { limit, offset } = limits(req);
		const { data: community } = await s.api.communities.get({ id: String(req.params.id) });
		if (!community) {
			send(req, res, 'error', { error: 'not_found' }, 404);
			return;
		}
		const { data } = await s.api.communities.feed.getFresh({ id: community.olive_community_id, limit: limit + 1, offset });
		send(req, res, 'posts', {
			community: mapCommunity(community),
			posts: data.items.slice(0, limit).map(p => mapPost(p, origin(req))),
			next_offset: data.items.length > limit ? offset + limit : null
		});
	}));

	router.get('/posts/:id', authed(async (req, res, s) => {
		const { limit, offset } = limits(req);
		const { data: post } = await s.api.posts.get({ post_id: String(req.params.id) });
		if (!post) {
			send(req, res, 'error', { error: 'not_found' }, 404);
			return;
		}
		const { data: replies } = await s.api.posts.list({ parent_id: post.id, include_replies: 'true', sort: 'oldest', limit, offset });
		send(req, res, 'thread', {
			post: mapPost(post, origin(req)),
			replies: replies.items.map(p => mapPost(p, origin(req))),
			next_offset: offset + replies.items.length < replies.total ? offset + replies.items.length : null
		});
	}));

	router.get('/activity', authed(async (req, res, s) => {
		const { limit, offset } = limits(req);
		const { data } = await s.api.activityFeed.getPeople({ limit: limit + 1, offset });
		const unread = (await wrapApi(s.api.self.getNotifications())).result?.unreadNotifications ?? 0;
		send(req, res, 'activity', {
			unread_notifications: unread,
			posts: data.items.slice(0, limit).map(p => mapPost(p, origin(req))),
			next_offset: data.items.length > limit ? offset + limit : null
		});
	}));

	// One call for a dashboard tile: recent posts, a few communities, and the activity counter.
	router.get('/feed', authed(async (req, res, s) => {
		const { limit } = limits(req);
		const [recent, communities, unread] = await Promise.all([
			s.api.activityFeed.getFresh({ limit, offset: 0 }),
			s.api.communities.list({ category: 'listed', sort: 'newest', limit: 10, offset: 0 }),
			wrapApi(s.api.self.getNotifications())
		]);
		send(req, res, 'feed', {
			generated_at: new Date().toISOString(),
			account: { display_name: s.self.miiName },
			unread_notifications: unread.result?.unreadNotifications ?? 0,
			communities: communities.data.items.map(mapCommunity),
			posts: recent.data.items.map(p => mapPost(p, origin(req)))
		});
	}));

	router.use((req, res) => send(req, res, 'error', { error: 'not_found' }, 404));
	return router;
}
