/* OpenVerse Lite: server-rendered pages for the built-in browsers of older consoles.
 *
 *   /ps3/…  /wii/…  /dsi/…     the same pages, sized per device
 *   /img/paintings/…           drawings, proxied (the CDN host speaks modern TLS only)
 *
 * Served on its own host over plain HTTP from our edge (see docs/lite.md). Signing in is a link code
 * approved on verse.openpak.org; the console then holds a device token in a cookie. */

import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '@/config';
import { logger } from '@/logger';
import { InternalApiError, wrapApi } from '@/api/errors';
import { COOKIE, csrfFor, csrfOk, parseCookie } from '@/lite/auth';
import { detectClass, isLiteClass, PROFILES } from '@/lite/device';
import { clip, esc, formatTime, page, text } from '@/lite/html';
import { displayCode, normalizeCode, pollCode, startLink } from '@/lite/linkCodes';
import { defaultDeps, loadSession } from '@/lite/session';
import { localImage } from '@/lite/images';
import { createX360Router } from '@/lite/x360';
import type { Request, Response, Router } from 'express';
import type { Community, Post } from '@/api/generated';
import type { LiteClass, LiteProfile } from '@/lite/device';
import type { KV } from '@/lite/linkCodes';
import type { LiteSession } from '@/lite/auth';
import type { SessionDeps } from '@/lite/session';

export type LiteDeps = SessionDeps & {
	kv: KV;
	/** Fetch a drawing from the CDN (internal address). Tests replace it. */
	fetchImage: (path: string) => Promise<{ type: string; data: Buffer } | null>;
};

const MAX_POST_CHARS = 280;
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export const defaultFetchImage: LiteDeps['fetchImage'] = async (path) => {
	const res = await fetch(`${config.lite.cdnInternalUrl}/cdn/${path}`, { signal: AbortSignal.timeout(5000) });
	if (!res.ok) {
		return null;
	}
	const data = Buffer.from(await res.arrayBuffer());
	return data.length > 300_000 ? null : { type: res.headers.get('content-type') ?? 'image/png', data };
};

const NOTES: Record<string, { kind: 'note' | 'bad'; text: string }> = {
	posted: { kind: 'note', text: 'Posted.' },
	replied: { kind: 'note', text: 'Reply posted.' },
	empty: { kind: 'bad', text: 'Write something first.' },
	long: { kind: 'bad', text: `That is too long. The limit is ${MAX_POST_CHARS} characters.` },
	held: { kind: 'bad', text: 'That post was not accepted. Please change it and try again.' },
	readonly: { kind: 'bad', text: 'This account is supervised, so it can read but not post or reply.' },
	denied: { kind: 'bad', text: 'You cannot post here.' },
	failed: { kind: 'bad', text: 'That did not work. Please try again.' },
	slow: { kind: 'bad', text: 'Too fast. Wait a moment and try again.' },
	out: { kind: 'note', text: 'This device was signed out. Link it again to continue.' },
	expired: { kind: 'note', text: 'That code ran out. Here is a new one.' },
	toomany: { kind: 'bad', text: 'This account has too many linked devices. Remove one at verse.openpak.org/devices.' }
};

function flash(req: Request): string {
	const n = typeof req.query.n === 'string' ? NOTES[req.query.n] : undefined;
	return n ? `<div class="${n.kind}">${esc(n.text)}</div>` : '';
}

function pageNumber(req: Request): number {
	const n = Number.parseInt(String(req.query.page ?? '1'), 10);
	return Number.isInteger(n) && n >= 1 && n <= 500 ? n : 1;
}

function canPostIn(community: Community, s: LiteSession, reply: boolean): boolean {
	if (s.self.readOnly || !s.self.permissions.posting) {
		return false;
	}
	const p = community.permissions;
	const need = reply ? p.minimum_new_comment_access_level : p.minimum_new_post_access_level;
	if (s.self.permissions.accessLevel < need) {
		return false;
	}
	return reply ? p.open : community.type === 0 || community.type === 1;
}

function pager(base: string, path: string, pageNo: number, hasNext: boolean, extra = ''): string {
	const links: string[] = [];
	if (pageNo > 1) {
		links.push(`<a href="${base}${path}?page=${pageNo - 1}${extra}">Newer</a>`);
	}
	if (hasNext) {
		links.push(`<a href="${base}${path}?page=${pageNo + 1}${extra}">Older</a>`);
	}
	return links.length ? `<div class="pager">${links.join(' ')}</div>` : '';
}

function postCard(base: string, p: LiteProfile, post: Post, opts: { full: boolean; link: boolean }): string {
	const body = post.body ?? '';
	const shown = opts.full ? body : clip(body, p.listChars);
	let art = '';
	if (post.painting) {
		const src = localImage(post.painting.imageUrl);
		art = p.images && src
			? `<div class="body"><img class="paint" src="${esc(src)}" width="320" height="120" alt="Drawing"></div>`
			: '<div class="body meta">[drawing]</div>';
	}
	const when = p.images ? ` <span class="meta">${esc(formatTime(post.createdAt))}</span>` : '';
	const open = opts.link ? ` · <a href="${base}/p/${esc(post.id)}">Open</a>` : '';
	return `<div class="box"><span class="who">${esc(post.author.miiName || 'OpenPak player')}</span>${when}
<div class="body">${text(shown)}</div>${art}
<div class="meta">${post.stats.empathyCount} Yeah · ${post.stats.replyCount} replies${open}</div></div>`;
}

function form(base: string, s: LiteSession, action: string, fields: string, submit: string): string {
	return `<form method="post" action="${base}${action}">
<input type="hidden" name="k" value="${csrfFor(s.token, config.aesKey)}">
${fields}
<input type="submit" value="${esc(submit)}">
</form>`;
}

function textForm(base: string, p: LiteProfile, s: LiteSession, action: string, hidden: string, label: string, submit: string): string {
	return `<div class="box"><h2>${esc(label)}</h2>${form(base, s, action,
		`${hidden}<p><textarea name="body" rows="${p.rows}" cols="30"></textarea></p>`, submit)}</div>`;
}

export function createLiteRouter(deps: LiteDeps = { ...defaultDeps, kv: undefined as never, fetchImage: defaultFetchImage }): Router {
	const router = express.Router();
	const urlencoded = express.urlencoded({ extended: false, limit: '16kb' });

	const startLimit = rateLimit({
		windowMs: 60 * 60 * 1000,
		limit: 30,
		standardHeaders: false,
		legacyHeaders: false,
		handler: (_req, res) => {
			res.status(429).type('html').send(page({ cls: 'ps3', title: 'Slow down', body: '<div class="bad">Too many link codes from this address. Try again later.</div>' }));
		}
	});
	const writeLimit = rateLimit({
		windowMs: 15 * 1000,
		limit: 10,
		standardHeaders: false,
		legacyHeaders: false,
		handler: (req, res) => {
			const cls = clsOf(req);
			res.redirect(`/${cls}/?n=slow`);
		}
	});

	function clsOf(req: Request): LiteClass {
		const first = req.baseUrl.split('/')[1];
		return isLiteClass(first) ? first : 'ps3';
	}

	function notice(res: Response, cls: LiteClass, code: number, title: string, message: string): void {
		res.status(code).type('html').send(page({ cls, title, body: `<div class="${code >= 500 ? 'bad' : 'note'}">${esc(message)}</div>` }));
	}

	// Drawings, proxied. Only paintings; the path is whitelisted.
	router.get(/^\/img\/(paintings\/[\w.-]+\/[\w.-]+\.png)$/, async (req, res) => {
		const path = req.params[0] as string;
		try {
			const img = await deps.fetchImage(path);
			if (!img) {
				res.sendStatus(404);
				return;
			}
			res.set('Cache-Control', 'public, max-age=86400').type(img.type).send(img.data);
		} catch (e) {
			logger.warn(e, 'Lite drawing fetch failed');
			res.sendStatus(502);
		}
	});

	// Xbox 360 dashboard feed (JSON/XML, bearer token)
	router.use('/x360/v1', createX360Router(deps));

	// Root: send each browser to its own pages.
	router.get('/', (req, res) => {
		res.set('Cache-Control', 'no-store').redirect(`/${detectClass(req.get('user-agent'))}/`);
	});

	for (const cls of ['ps3', 'wii', 'dsi'] as const) {
		const p = PROFILES[cls];
		const base = `/${cls}`;
		const r = express.Router();

		async function session(req: Request, res: Response): Promise<LiteSession | null> {
			const token = parseCookie(req.get('cookie'), COOKIE);
			let result;
			try {
				result = await loadSession(deps, token);
			} catch (e) {
				logger.error(e, 'Lite session lookup failed');
				notice(res, cls, 503, 'Unavailable', 'OpenVerse is not reachable right now. Please try again in a moment.');
				return null;
			}
			if (result.kind === 'ok') {
				return result.session;
			}
			if (result.kind === 'unavailable') {
				notice(res, cls, 403, 'Unavailable', result.reason === 'banned'
					? 'OpenVerse is not available for this account.'
					: 'This account is not set up yet. Open verse.openpak.org on a computer or phone once, then try again.');
				return null;
			}
			if (token) {
				res.clearCookie(COOKIE, { path: '/' });
				res.redirect(`${base}/link?n=out`);
			} else {
				res.redirect(`${base}/link`);
			}
			return null;
		}

		const guarded = (handler: (req: Request, res: Response, s: LiteSession) => Promise<void>) =>
			async (req: Request, res: Response): Promise<void> => {
				const s = await session(req, res);
				if (!s) {
					return;
				}
				try {
					await handler(req, res, s);
				} catch (e) {
					if (e instanceof InternalApiError && e.status === 401) {
						res.clearCookie(COOKIE, { path: '/' });
						res.redirect(`${base}/link?n=out`);
						return;
					}
					logger.error(e, 'Lite request failed');
					notice(res, cls, 500, 'Error', 'Something went wrong. Please try again.');
				}
			};

		const shell = (res: Response, title: string, body: string, nav = true): void => {
			res.set('Cache-Control', 'no-store').type('html').send(page({ cls, title, body, nav }));
		};

		// ---- link ---------------------------------------------------------------------------------
		r.get('/link', startLimit, async (req, res) => {
			const known = await loadSession(deps, parseCookie(req.get('cookie'), COOKIE)).catch(() => null);
			if (known?.kind === 'ok') {
				res.redirect(`${base}/`);
				return;
			}
			const code = normalizeCode(typeof req.query.c === 'string' ? req.query.c : null);
			const secret = typeof req.query.s === 'string' ? req.query.s : '';
			const ip = req.ip ?? '';
			if (!code || !secret) {
				const started = await startLink(deps.kv, { deviceClass: cls, ip });
				const n = typeof req.query.n === 'string' && NOTES[req.query.n] ? `&n=${req.query.n}` : '';
				res.redirect(`${base}/link?c=${started.code}&s=${started.secret}${n}`);
				return;
			}
			const polled = await pollCode(deps.kv, code, secret, ip);
			if (polled.status === 'gone') {
				res.redirect(`${base}/link?n=expired`);
				return;
			}
			if (polled.status === 'approved') {
				const created = await wrapApi(deps.makeApi({}).deviceLinks.create({ accountId: polled.accountId, deviceClass: cls }));
				if (!created.result) {
					res.redirect(`${base}/link?n=toomany`);
					return;
				}
				res.cookie(COOKIE, created.result.token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE_MAX_AGE_MS });
				res.redirect(`${base}/`);
				return;
			}
			const here = `${base}/link?c=${code}&s=${encodeURIComponent(secret)}`;
			const approve = config.lite.approveUrl;
			res.set('Cache-Control', 'no-store').type('html').send(page({
				cls,
				title: 'Link this device',
				refresh: { seconds: 5, url: here },
				body: `${flash(req)}<div class="box"><h1>Link this ${esc(p.label)}</h1>
<p>Your code:</p>
<p class="code">${esc(displayCode(code))}</p>
<p>On a computer or phone, open <b>${esc(approve.replace(/^https?:\/\//, ''))}</b>, sign in with your OpenPak account and type this code.</p>
<p class="meta">This page checks by itself every few seconds. The code works for 10 minutes. You never type a password on this device.</p>
<p><a href="${esc(here)}">Check now</a></p></div>`
			}));
		});

		// ---- pages --------------------------------------------------------------------------------
		r.get('/', guarded(async (req, res, s) => {
			const { data: fresh } = await s.api.activityFeed.getFresh({ limit: p.perPage + 1, offset: (pageNumber(req) - 1) * p.perPage });
			const items = fresh.items.slice(0, p.perPage);
			const body = `${flash(req)}${s.self.readOnly ? `<div class="note">${esc(NOTES.readonly!.text)}</div>` : ''}
<h2>Latest posts</h2>
${items.length ? items.map(post => postCard(base, p, post, { full: false, link: true })).join('') : '<div class="box">Nothing here yet. Open a community and write the first post.</div>'}
${pager(base, '/', pageNumber(req), fresh.items.length > p.perPage)}
<p><a href="${base}/c">All communities</a></p>`;
			shell(res, 'Home', body);
		}));

		r.get('/c', guarded(async (req, res, s) => {
			const pageNo = pageNumber(req);
			const { data: list } = await s.api.communities.list({ category: 'listed', sort: 'newest', limit: p.perPage, offset: (pageNo - 1) * p.perPage });
			const rows = list.items.map(c => `<div class="box"><a class="who" href="${base}/c/${esc(c.olive_community_id)}">${esc(c.name)}</a>${p.images && c.description ? `<div class="body meta">${esc(clip(c.description, 110))}</div>` : ''}</div>`);
			shell(res, 'Communities', `${flash(req)}<h2>Communities</h2>${rows.join('') || '<div class="box">No communities yet.</div>'}${pager(base, '/c', pageNo, (pageNo - 1) * p.perPage + list.items.length < list.total)}`);
		}));

		r.get('/c/:id', guarded(async (req, res, s) => {
			const id = String(req.params.id);
			const { data: community } = await s.api.communities.get({ id });
			if (!community) {
				notice(res, cls, 404, 'Not found', 'That community does not exist.');
				return;
			}
			const pageNo = pageNumber(req);
			const { data: feed } = await s.api.communities.feed.getFresh({ id: community.olive_community_id, limit: p.perPage + 1, offset: (pageNo - 1) * p.perPage });
			const items = feed.items.slice(0, p.perPage);
			const canPost = canPostIn(community, s, false);
			const compose = canPost
				? textForm(base, p, s, '/post', `<input type="hidden" name="community" value="${esc(community.olive_community_id)}">`, 'Write a post', 'Post')
				: `<div class="note">${esc(s.self.readOnly ? NOTES.readonly!.text : 'Posting is not open in this community.')}</div>`;
			shell(res, community.name, `${flash(req)}<h1>${esc(community.name)}</h1>${p.images && community.description ? `<p>${esc(clip(community.description, 300))}</p>` : ''}
${pageNo === 1 ? compose : ''}
${items.map(post => postCard(base, p, post, { full: false, link: true })).join('') || '<div class="box">No posts yet.</div>'}
${pager(base, `/c/${community.olive_community_id}`, pageNo, feed.items.length > p.perPage)}`);
		}));

		r.get('/p/:id', guarded(async (req, res, s) => {
			const { data: post } = await s.api.posts.get({ post_id: String(req.params.id) });
			if (!post) {
				notice(res, cls, 404, 'Not found', 'That post does not exist.');
				return;
			}
			const pageNo = pageNumber(req);
			const { data: replies } = await s.api.posts.list({
				parent_id: post.id, include_replies: 'true', sort: 'oldest', limit: p.perPage, offset: (pageNo - 1) * p.perPage
			});
			const community = post.community ? (await s.api.communities.get({ id: post.community.olive_community_id })).data : null;
			const yeahed = post.yeahsBy.some(y => y.pid === s.pid);
			const canAct = !s.self.readOnly && s.self.permissions.posting;
			const yeah = canAct
				? form(base, s, '/yeah', `<input type="hidden" name="post" value="${esc(post.id)}">`, yeahed ? 'Yeah! (undo)' : 'Yeah!')
				: '';
			const canReply = community ? canPostIn(community, s, true) : false;
			const back = post.community ? `<p><a href="${base}/c/${esc(post.community.olive_community_id)}">Back to ${esc(post.community.name)}</a></p>` : '';
			shell(res, 'Post', `${flash(req)}${back}${postCard(base, p, post, { full: true, link: false })}${yeah}
<h2>Replies</h2>
${replies.items.map(rep => postCard(base, p, rep, { full: true, link: false })).join('') || '<div class="box">No replies yet.</div>'}
${pager(base, `/p/${post.id}`, pageNo, (pageNo - 1) * p.perPage + replies.items.length < replies.total)}
${canReply ? textForm(base, p, s, '/reply', `<input type="hidden" name="post" value="${esc(post.id)}">`, 'Write a reply', 'Reply') : ''}`);
		}));

		r.get('/me', guarded(async (req, res, s) => {
			shell(res, 'This device', `${flash(req)}<div class="box"><h1>${esc(s.self.miiName || 'OpenPak player')}</h1>
<p>This ${esc(p.label)} is linked to your OpenPak account.</p>
${s.self.readOnly ? `<div class="note">${esc(NOTES.readonly!.text)}</div>` : ''}
${form(base, s, '/signout', '', 'Sign this device out')}
<p class="meta">You can also remove any linked device at ${esc(config.lite.approveUrl.replace(/^https?:\/\//, ''))}.</p></div>`);
		}));

		r.get('/about', async (req, res) => {
			const signedIn = parseCookie(req.get('cookie'), COOKIE) !== null;
			res.type('html').send(page({
				cls, title: 'About', nav: signedIn,
				body: `<div class="box"><h1>About OpenVerse Lite</h1>
<p>OpenVerse is the social network of the OpenPak project. Lite is the small version for the built-in browsers of older consoles. It shows communities and posts, and lets you post text, reply and send a Yeah.</p>
<p>Based on Juxtaposition by Pretendo Network (AGPL-3.0). OpenVerse is free software under the same licence. <a href="https://github.com/openpak/nn-juxtaposition">Source</a></p>
<p class="meta">This page is served over plain HTTP because these browsers cannot do modern HTTPS. Your password is never typed here. Linking uses a short code you approve on a secure page.</p></div>`
			}));
		});

		// ---- actions ------------------------------------------------------------------------------
		const checked = (req: Request, s: LiteSession): boolean => csrfOk(s.token, config.aesKey, req.body?.k);

		function cleanBody(raw: unknown): string {
			// eslint-disable-next-line no-control-regex -- control characters are stripped on purpose
			return String(raw ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n/g, '\n').trim();
		}

		function explain(e: InternalApiError | null): string {
			if (e?.isCode('automod_prevented')) {
				return 'held';
			}
			if (e?.isCode('auth_read_only')) {
				return 'readonly';
			}
			if (e?.isCode('invalid_post')) {
				return 'empty';
			}
			if (e?.isCode('forbidden')) {
				return 'denied';
			}
			return 'failed';
		}

		r.post('/post', writeLimit, urlencoded, guarded(async (req, res, s) => {
			const community = String(req.body?.community ?? '');
			const back = `${base}/c/${encodeURIComponent(community)}`;
			if (!checked(req, s)) {
				res.redirect(`${back}?n=failed`);
				return;
			}
			const body = cleanBody(req.body?.body);
			if (!body) {
				res.redirect(`${back}?n=empty`);
				return;
			}
			if ([...body].length > MAX_POST_CHARS) {
				res.redirect(`${back}?n=long`);
				return;
			}
			const out = await wrapApi(s.api.communities.createPost({ id: community, postCreateBody: { body, feelingId: 0, isSpoiler: false, isAppJumpable: false } }));
			res.redirect(`${back}?n=${out.error || !out.result ? explain(out.error) : 'posted'}`);
		}));

		r.post('/reply', writeLimit, urlencoded, guarded(async (req, res, s) => {
			const post = String(req.body?.post ?? '');
			const back = `${base}/p/${encodeURIComponent(post)}`;
			if (!checked(req, s)) {
				res.redirect(`${back}?n=failed`);
				return;
			}
			const body = cleanBody(req.body?.body);
			if (!body) {
				res.redirect(`${back}?n=empty`);
				return;
			}
			if ([...body].length > MAX_POST_CHARS) {
				res.redirect(`${back}?n=long`);
				return;
			}
			const out = await wrapApi(s.api.posts.reply({ post_id: post, postCreateBody: { body, feelingId: 0, isSpoiler: false, isAppJumpable: false } }));
			res.redirect(`${back}?n=${out.error || !out.result ? explain(out.error) : 'replied'}`);
		}));

		r.post('/yeah', writeLimit, urlencoded, guarded(async (req, res, s) => {
			const id = String(req.body?.post ?? '');
			const back = `${base}/p/${encodeURIComponent(id)}`;
			if (!checked(req, s)) {
				res.redirect(`${back}?n=failed`);
				return;
			}
			const { data: post } = await s.api.posts.get({ post_id: id });
			if (!post) {
				res.redirect(`${base}/?n=failed`);
				return;
			}
			const action = post.yeahsBy.some(y => y.pid === s.pid) ? 'remove' : 'add';
			const out = await wrapApi(s.api.posts.changeEmpathy({ post_id: post.id, action }));
			res.redirect(out.error ? `${back}?n=${explain(out.error)}` : back);
		}));

		r.post('/signout', urlencoded, guarded(async (req, res, s) => {
			if (!checked(req, s)) {
				res.redirect(`${base}/me?n=failed`);
				return;
			}
			await wrapApi(deps.makeApi({}).deviceLinks.revoke({ accountId: s.accountId, id: s.linkId }));
			res.clearCookie(COOKIE, { path: '/' });
			res.redirect(`${base}/link?n=out`);
		}));

		r.use((_req, res) => notice(res, cls, 404, 'Not found', 'That page does not exist.'));
		router.use(base, r);
	}

	router.use((req, res) => notice(res, detectClass(req.get('user-agent')), 404, 'Not found', 'That page does not exist.'));
	return router;
}
