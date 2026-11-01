/* eslint-disable @typescript-eslint/explicit-function-return-type -- test fakes */
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({
	config: {
		aesKey: 'k'.repeat(64),
		cdnDomain: 'https://api.olv.openpak.org/cdn',
		lite: { hosts: 'lite.test', cdnInternalUrl: 'http://cdn.invalid', approveUrl: 'https://verse.openpak.org/devices' },
		ratelimit: { posts: true, yeahs: true }
	}
}));
vi.mock('@/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/api/client', () => ({ createInternalApiClient: vi.fn() }));

const { createLiteRouter } = await import('@/lite/router');
const { approveCode, peekCode, normalizeCode, displayCode, startLink, pollCode } = await import('@/lite/linkCodes');
const { detectClass, PROFILES } = await import('@/lite/device');
const { esc, text, clip } = await import('@/lite/html');
const { toXml, wantsXml } = await import('@/lite/x360');
const { InternalApiError } = await import('@/api/errors');

// ---- fakes ------------------------------------------------------------------------------------------

function memoryKv() {
	const m = new Map<string, string>();
	return {
		get: async (k: string) => m.get(k) ?? null,
		set: async (k: string, v: string) => void m.set(k, v),
		getDel: async (k: string) => {
			const v = m.get(k) ?? null;
			m.delete(k);
			return v;
		},
		m
	};
}

const community = {
	olive_community_id: '100', name: 'Off-topic', description: 'Anything goes', followerCount: 3, type: 0,
	permissions: { open: true, minimum_new_post_access_level: 0, minimum_new_comment_access_level: 0, minimum_new_community_access_level: 0 }
};
const mkPost = (id: string, body: string, extra: Record<string, unknown> = {}) => ({
	id, createdAt: '2026-11-01T10:00:00.000Z', parentId: null, community: { olive_community_id: '100', name: 'Off-topic' },
	author: { miiName: 'Ann <b>', pid: 1800000009, verified: false }, body, painting: null,
	stats: { empathyCount: 2, replyCount: 1 }, yeahsBy: [], ...extra
});

function fakeApi(opts: { readOnly?: boolean; links: Map<string, { id: string; accountId: string; deviceClass: string }> }) {
	const posts: Array<ReturnType<typeof mkPost>> = [mkPost('p1', 'Hello <script>alert(1)</script>\nsecond line'), mkPost('p2', 'x'.repeat(400), { painting: { imageUrl: 'https://api.olv.openpak.org/cdn/paintings/1/2.png' } })];
	const calls: string[] = [];
	const self = {
		pid: 1800000009, miiName: 'Ann', readOnly: opts.readOnly ?? false, banState: null,
		permissions: { posting: true, accessLevel: 0, moderator: false }
	};
	const ok = <T>(data: T) => Promise.resolve({ data });
	const api: any = {
		deviceLinks: {
			resolve: ({ token }: { token: string }) => {
				const l = opts.links.get(token);
				return ok(l ? { ...l, pid: 1800000009 } : null);
			},
			create: ({ accountId, deviceClass }: { accountId: string; deviceClass: string }) => {
				const token = `ovd1.tok-${opts.links.size}`;
				opts.links.set(token, { id: `l${opts.links.size}`, accountId, deviceClass });
				return ok({ id: 'x', token, deviceClass, label: deviceClass });
			},
			revoke: ({ id }: { id: string }) => {
				for (const [t, l] of opts.links) {
					if (l.id === id) {
						opts.links.delete(t);
					}
				}
				return ok({ status: 'success' });
			}
		},
		self: { get: () => ok(self), getNotifications: () => ok({ unreadNotifications: 4 }) },
		activityFeed: { getFresh: () => ok({ items: posts }), getPeople: () => ok({ items: [posts[0]] }) },
		communities: {
			list: () => ok({ items: [community], total: 1 }),
			get: ({ id }: { id: string }) => ok(id === '100' ? community : null),
			feed: { getFresh: () => ok({ items: posts }) },
			createPost: ({ postCreateBody }: any) => {
				calls.push('createPost:' + postCreateBody.body);
				if (opts.readOnly) {
					return Promise.reject(new InternalApiError(403, { errorCode: 'auth_read_only' }));
				}
				return ok(mkPost('p3', postCreateBody.body));
			}
		},
		posts: {
			get: ({ post_id }: { post_id: string }) => ok(posts.find(p => p.id === post_id) ?? null),
			list: () => ok({ items: [mkPost('r1', 'a reply')], total: 1 }),
			reply: ({ postCreateBody }: any) => {
				calls.push('reply:' + postCreateBody.body);
				return ok(mkPost('r2', postCreateBody.body));
			},
			changeEmpathy: ({ action }: { action: string }) => {
				calls.push('yeah:' + action);
				return ok({ post_id: 'p1', empathy_count: 3 });
			}
		}
	};
	return { api, calls };
}

let server: http.Server;
let base = '';
const links = new Map<string, { id: string; accountId: string; deviceClass: string }>();
const kv = memoryKv();
let calls: string[] = [];
let readOnly = false;

const UA = {
	ps3: 'Mozilla/5.0 (PLAYSTATION 3 4.91) AppleWebKit/531.22.8 (KHTML, like Gecko)',
	wii: 'Opera/9.30 (Nintendo Wii; U; ; 3642; en)',
	dsi: 'Opera/9.50 (Nintendo DSi; Opera/507; U; en-US)'
};

beforeAll(async () => {
	const app = express();
	const state = () => fakeApi({ links, readOnly });
	app.use(createLiteRouter({
		kv: kv as never,
		makeApi: () => {
			const s = state();
			calls = s.calls;
			return s.api;
		},
		fetchImage: async p => (p === 'paintings/1/2.png' ? { type: 'image/png', data: Buffer.from('PNG') } : null)
	}));
	server = http.createServer(app);
	await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => void server.close());

// A tiny cookie-keeping client with the console's user agent.
function client(ua: string) {
	let cookie = '';
	return async (path: string, init: { method?: string; form?: Record<string, string> } = {}) => {
		const res = await fetch(base + path, {
			method: init.method ?? 'GET',
			redirect: 'manual',
			headers: { 'user-agent': ua, ...(cookie ? { cookie } : {}), ...(init.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
			body: init.form ? new URLSearchParams(init.form).toString() : undefined
		});
		for (const sc of res.headers.getSetCookie()) {
			const [pair] = sc.split(';');
			cookie = pair!.startsWith('ovl=') && sc.includes('Max-Age=0') ? '' : pair!;
		}
		return { status: res.status, location: res.headers.get('location'), html: await res.text(), headers: res.headers, cookie };
	};
}

describe('device detection', () => {
	it('maps the console user agents', () => {
		expect(detectClass(UA.ps3)).toBe('ps3');
		expect(detectClass(UA.wii)).toBe('wii');
		expect(detectClass(UA.dsi)).toBe('dsi');
		expect(detectClass('Mozilla/5.0 (Nintendo WiiU) AppleWebKit/536.30')).toBe('ps3');
		expect(detectClass(undefined)).toBe('ps3');
	});
	it('sizes the DSi smaller and without images', () => {
		expect(PROFILES.dsi.perPage).toBeLessThan(PROFILES.wii.perPage);
		expect(PROFILES.dsi.images).toBe(false);
	});
});

describe('html helpers', () => {
	it('escapes user text and keeps line breaks', () => {
		expect(esc('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
		expect(text('a\nb<i>')).toBe('a<br>b&lt;i&gt;');
		expect(clip('abcdef', 4)).toBe('abc…');
		expect(clip('abc', 0)).toBe('abc');
	});
});

describe('link codes', () => {
	it('normalises what people type and rejects look-alikes', () => {
		expect(normalizeCode('abc-23x')).toBe('ABC23X');
		expect(normalizeCode(' abc 23x ')).toBe('ABC23X');
		expect(normalizeCode('ABC10O')).toBeNull();
		expect(normalizeCode('ABC')).toBeNull();
		expect(displayCode('ABC23X')).toBe('ABC-23X');
	});
	it('needs the secret and the same address, and hands the approval out once', async () => {
		const k = memoryKv() as never;
		const { code, secret } = await startLink(k, { deviceClass: 'wii', ip: '1.2.3.4' });
		expect(await pollCode(k, code, 'wrong', '1.2.3.4')).toEqual({ status: 'gone' });
		expect(await pollCode(k, code, secret, '9.9.9.9')).toEqual({ status: 'gone' });
		expect(await pollCode(k, code, secret, '1.2.3.4')).toEqual({ status: 'pending' });
		expect(await approveCode(k, code, 'acc')).toBe(true);
		expect(await approveCode(k, code, 'other')).toBe(false);
		expect((await peekCode(k, code))?.accountId).toBe('acc');
		expect(await pollCode(k, code, secret, '1.2.3.4')).toEqual({ status: 'approved', accountId: 'acc', deviceClass: 'wii' });
		expect(await pollCode(k, code, secret, '1.2.3.4')).toEqual({ status: 'gone' });
	});
});

describe('Lite pages', () => {
	it('sends each console browser to its own pages and unlinked ones to the link code', async () => {
		for (const cls of ['ps3', 'wii', 'dsi'] as const) {
			const get = client(UA[cls]);
			const root = await get('/');
			expect(root.location).toBe(`/${cls}/`);
			const home = await get(`/${cls}/`);
			expect(home.location).toBe(`/${cls}/link`);
		}
	});

	it('links a Wii end to end with a code approved elsewhere, then reads, posts, replies and sends a Yeah', async () => {
		const get = client(UA.wii);
		const start = await get('/wii/link');
		expect(start.status).toBe(302);
		const first = await get(start.location!);
		expect(first.status).toBe(200);
		expect(first.html).toContain('http-equiv="refresh"');
		expect(first.html).toContain('verse.openpak.org/devices');
		expect(first.html).not.toMatch(/<script/i);
		const url = new URL(start.location!, base);
		const code = url.searchParams.get('c')!;
		// pending polls do not hand out anything
		expect((await get(start.location!)).status).toBe(200);
		expect(await approveCode(kv as never, code, 'acc-1')).toBe(true);
		const done = await get(start.location!);
		expect(done.status).toBe(302);
		expect(done.location).toBe('/wii/');
		expect(done.cookie).toMatch(/^ovl=ovd1\./);
		// the same poll cannot be replayed for a second token
		expect((await client(UA.wii)(start.location!)).location).toBe('/wii/link?n=expired');

		const home = await get('/wii/');
		expect(home.status).toBe(200);
		expect(home.html).toContain('OpenVerse');
		expect(home.html).toContain('Ann &lt;b&gt;');
		expect(home.html).not.toContain('<script>alert');
		expect(home.html).toContain('Hello &lt;script&gt;');
		expect(home.html).toContain('…'); // long post cut for the Wii list

		const comm = await get('/wii/c/100');
		expect(comm.html).toContain('Write a post');
		const k = /name="k" value="([a-f0-9]+)"/.exec(comm.html)![1]!;
		const posted = await get('/wii/post', { method: 'POST', form: { community: '100', body: ' hi there ', k } });
		expect(posted.location).toBe('/wii/c/100?n=posted');
		expect(calls).toContain('createPost:hi there');
		expect((await get('/wii/post', { method: 'POST', form: { community: '100', body: 'x', k: 'bad' } })).location).toBe('/wii/c/100?n=failed');
		expect((await get('/wii/post', { method: 'POST', form: { community: '100', body: '   ', k } })).location).toBe('/wii/c/100?n=empty');
		expect((await get('/wii/post', { method: 'POST', form: { community: '100', body: 'y'.repeat(281), k } })).location).toBe('/wii/c/100?n=long');

		const post = await get('/wii/p/p1');
		expect(post.html).toContain('second line');
		expect(post.html).toContain('a reply');
		expect(post.html).toContain('Yeah!');
		expect((await get('/wii/yeah', { method: 'POST', form: { post: 'p1', k } })).location).toBe('/wii/p/p1');
		expect(calls).toContain('yeah:add');
		expect((await get('/wii/reply', { method: 'POST', form: { post: 'p1', body: 'nice', k } })).location).toBe('/wii/p/p1?n=replied');

		// drawings go through the proxy and are skipped on the DSi
		expect((await get('/wii/p/p2')).html).toContain('src="/img/paintings/1/2.png"');

		// signing the device out revokes it
		const out = await get('/wii/signout', { method: 'POST', form: { k } });
		expect(out.location).toBe('/wii/link?n=out');
		expect([...links.values()].find(l => l.accountId === 'acc-1')).toBeUndefined();
		expect((await get('/wii/')).location).toBe('/wii/link');
	});

	it('shows a DSi text-only pages with 4 per page', async () => {
		const get = client(UA.dsi);
		const start = await get('/dsi/link');
		const code = new URL(start.location!, base).searchParams.get('c')!;
		await approveCode(kv as never, code, 'acc-2');
		await get(start.location!);
		const home = await get('/dsi/');
		expect(home.html).not.toContain('<img');
		const post = await get('/dsi/p/p2');
		expect(post.html).toContain('[drawing]');
		expect(post.html).not.toContain('<img');
	});

	it('serves the PS3 in full width with the drawing image', async () => {
		const get = client(UA.ps3);
		const start = await get('/ps3/link');
		await approveCode(kv as never, new URL(start.location!, base).searchParams.get('c')!, 'acc-3');
		await get(start.location!);
		const home = await get('/ps3/');
		expect(home.html).toContain('width: 880px');
		expect(home.html).toContain('<img class="paint"');
		expect(home.html).not.toContain('…');
	});

	it('is read-only for a supervised account', async () => {
		readOnly = true;
		const get = client(UA.ps3);
		const start = await get('/ps3/link');
		await approveCode(kv as never, new URL(start.location!, base).searchParams.get('c')!, 'acc-4');
		await get(start.location!);
		const comm = await get('/ps3/c/100');
		expect(comm.html).not.toContain('Write a post');
		expect(comm.html).toContain('supervised');
		const k = /name="k" value="([a-f0-9]+)"/.exec((await get('/ps3/me')).html)![1]!;
		const res = await get('/ps3/post', { method: 'POST', form: { community: '100', body: 'hi', k } });
		expect(res.location).toBe('/ps3/c/100?n=readonly');
		readOnly = false;
	});

	it('a revoked token is signed out on the next request', async () => {
		const get = client(UA.wii);
		const start = await get('/wii/link');
		await approveCode(kv as never, new URL(start.location!, base).searchParams.get('c')!, 'acc-5');
		await get(start.location!);
		expect((await get('/wii/')).status).toBe(200);
		links.clear();
		const after = await get('/wii/');
		expect(after.location).toBe('/wii/link?n=out');
	});

	it('proxies only whitelisted drawing paths', async () => {
		const ok = await fetch(`${base}/img/paintings/1/2.png`);
		expect(ok.status).toBe(200);
		expect(ok.headers.get('content-type')).toContain('image/png');
		expect((await fetch(`${base}/img/paintings/9/9.png`)).status).toBe(404);
		expect((await fetch(`${base}/img/../etc/passwd`)).status).toBe(404);
		expect((await fetch(`${base}/img/mii/1/normal_face.png`)).status).toBe(404);
	});

	it('never ships JavaScript or web fonts', async () => {
		const get = client(UA.ps3);
		const pages = [(await get('/ps3/link')).location!, '/ps3/about'];
		for (const p of pages) {
			const html = (await get(p)).html;
			expect(html).not.toMatch(/<script|@font-face|\.woff|<link /i);
		}
	});
});

describe('Xbox 360 feed', () => {
	async function link(): Promise<string> {
		const start = await fetch(`${base}/x360/v1/link/start`, { method: 'POST' }).then(r => r.json()) as any;
		expect(start.code).toHaveLength(6);
		const pending = await fetch(`${base}/x360/v1/link/poll`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: start.code, secret: start.poll_secret })
		}).then(r => r.json()) as any;
		expect(pending.status).toBe('pending');
		await approveCode(kv as never, start.code, 'acc-360');
		const done = await fetch(`${base}/x360/v1/link/poll`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: start.code, secret: start.poll_secret })
		}).then(r => r.json()) as any;
		expect(done.status).toBe('approved');
		return done.token;
	}

	it('needs a token and refuses browser-class tokens', async () => {
		expect((await fetch(`${base}/x360/v1/feed`)).status).toBe(401);
		links.set('ovd1.browser', { id: 'b', accountId: 'a', deviceClass: 'ps3' });
		const res = await fetch(`${base}/x360/v1/feed`, { headers: { authorization: 'Bearer ovd1.browser' } });
		expect(res.status).toBe(401);
	});

	it('serves recent posts, communities and activity as JSON, and XML on request', async () => {
		const token = await link();
		const auth = { authorization: `Bearer ${token}` };
		const feed = await fetch(`${base}/x360/v1/feed`, { headers: auth }).then(r => r.json()) as any;
		expect(feed.unread_notifications).toBe(4);
		expect(feed.communities[0]).toMatchObject({ id: '100', name: 'Off-topic' });
		expect(feed.posts[0]).toMatchObject({ id: 'p1', author: { name: 'Ann <b>' }, yeahs: 2 });
		expect(feed.posts[1].drawing_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/img\/paintings\/1\/2\.png$/);

		const xml = await fetch(`${base}/x360/v1/feed?format=xml`, { headers: auth });
		expect(xml.headers.get('content-type')).toContain('application/xml');
		const body = await xml.text();
		expect(body).toContain('<feed>');
		expect(body).toContain('<name>Ann &lt;b&gt;</name>');
		expect(body).toContain('<posts><post>');

		const act = await fetch(`${base}/x360/v1/activity`, { headers: auth }).then(r => r.json()) as any;
		expect(act.posts).toHaveLength(1);
		const comms = await fetch(`${base}/x360/v1/communities`, { headers: auth }).then(r => r.json()) as any;
		expect(comms.total).toBe(1);
		const cp = await fetch(`${base}/x360/v1/communities/100/posts?limit=1`, { headers: auth }).then(r => r.json()) as any;
		expect(cp.posts).toHaveLength(1);
		expect(cp.next_offset).toBe(1);
		const th = await fetch(`${base}/x360/v1/posts/p1`, { headers: auth }).then(r => r.json()) as any;
		expect(th.replies[0].body).toBe('a reply');
		expect((await fetch(`${base}/x360/v1/posts/none`, { headers: auth })).status).toBe(404);
		// read-only: no write routes
		expect((await fetch(`${base}/x360/v1/posts`, { method: 'POST', headers: auth })).status).toBe(404);
	});
});

describe('xml', () => {
	it('escapes and drops characters XML forbids', () => {
		expect(toXml('a', { b: 'x<y>&"\u0001', c: null, posts: [{ id: 1 }] })).toContain('<b>x&lt;y&gt;&amp;&quot;</b><c/><posts><post><id>1</id></post></posts>');
	});
	it('picks the format from the query or Accept', () => {
		const req = (q: object, accept = '') => ({ query: q, get: () => accept }) as never;
		expect(wantsXml(req({ format: 'xml' }))).toBe(true);
		expect(wantsXml(req({}, 'application/xml'))).toBe(true);
		expect(wantsXml(req({}, 'application/json, application/xml'))).toBe(false);
		expect(wantsXml(req({ format: 'json' }, 'application/xml'))).toBe(false);
	});
});
