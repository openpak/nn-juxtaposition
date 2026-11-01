import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { finishSso, safeRedirect, startSso, welcomeTarget } from '@/sso';
import type { SsoSettings } from '@/sso';

const settings: SsoSettings = {
	clientId: 'openverse',
	clientSecret: 'secret',
	authorizeUrl: 'https://openpak.org/account/sso/authorize',
	tokenUrl: 'http://openpak-website:20010/internal/sso/token',
	redirectUri: 'https://verse.openpak.org/login/callback'
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('startSso', () => {
	it('sends the browser to openpak.org with state and an S256 challenge', () => {
		const { url, pending } = startSso(settings, '/feed');
		const u = new URL(url);
		expect(u.origin + u.pathname).toBe(settings.authorizeUrl);
		expect(u.searchParams.get('client')).toBe('openverse');
		expect(u.searchParams.get('redirect_uri')).toBe(settings.redirectUri);
		expect(u.searchParams.get('state')).toBe(pending.state);
		expect(u.searchParams.get('code_challenge_method')).toBe('S256');
		expect(u.searchParams.get('code_challenge')).toBe(createHash('sha256').update(pending.verifier).digest('base64url'));
	});
});

describe('finishSso', () => {
	it('happy path: exchanges the code and returns the identity', async () => {
		const { pending } = startSso({ ...settings }, '/titles');
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { account_id: 'a1', display_name: 'Tobi', wiiu_pid: 1800000123 }));
		const result = await finishSso(settings, pending, { code: 'c', state: pending.state }, fetchFn);
		expect(result).toEqual({ ok: true, redirect: '/titles', identity: { accountId: 'a1', displayName: 'Tobi', wiiuPid: 1800000123 } });
		const [url, init] = fetchFn.mock.calls[0];
		expect(url).toBe(settings.tokenUrl);
		expect(init.headers.authorization).toBe('Basic ' + Buffer.from('openverse:secret').toString('base64'));
		const body = new URLSearchParams(init.body);
		expect(body.get('code')).toBe('c');
		expect(body.get('code_verifier')).toBe(pending.verifier);
		expect(body.get('redirect_uri')).toBe(settings.redirectUri);
	});

	it('a null wiiu_pid is reported as null, not an error', async () => {
		const { pending } = startSso(settings, '/');
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { account_id: 'a1', display_name: 'T', wiiu_pid: null }));
		const result = await finishSso(settings, pending, { code: 'c', state: pending.state }, fetchFn);
		expect(result.ok && result.identity.wiiuPid).toBeNull();
	});

	it('rejects a state mismatch without calling the token endpoint', async () => {
		const { pending } = startSso(settings, '/');
		const fetchFn = vi.fn();
		const result = await finishSso(settings, pending, { code: 'c', state: 'x'.repeat(pending.state.length) }, fetchFn);
		expect(result).toEqual({ ok: false, reason: 'state_mismatch' });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('rejects a callback with no pending sign-in', async () => {
		const result = await finishSso(settings, undefined, { code: 'c', state: 's' }, vi.fn());
		expect(result).toEqual({ ok: false, reason: 'no_pending' });
	});

	it('reports a failed exchange (401, network error)', async () => {
		const { pending } = startSso(settings, '/');
		const q = { code: 'c', state: pending.state };
		expect(await finishSso(settings, pending, q, vi.fn().mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }))))
			.toEqual({ ok: false, reason: 'exchange_failed' });
		expect(await finishSso(settings, pending, q, vi.fn().mockRejectedValue(new Error('down'))))
			.toEqual({ ok: false, reason: 'exchange_failed' });
	});

	it('rejects an expired pending sign-in', async () => {
		const { pending } = startSso(settings, '/', 0);
		const result = await finishSso(settings, pending, { code: 'c', state: pending.state }, vi.fn(), 11 * 60 * 1000);
		expect(result).toEqual({ ok: false, reason: 'expired' });
	});
});

describe('safeRedirect', () => {
	it('keeps local paths only', () => {
		expect(safeRedirect('/feed?x=1')).toBe('/feed?x=1');
		expect(safeRedirect('https://evil.example/')).toBe('/');
		expect(safeRedirect('//evil.example')).toBe('/');
		expect(safeRedirect('/login')).toBe('/');
		expect(safeRedirect(undefined)).toBe('/');
	});
});

describe('welcomeTarget (where Accept goes)', () => {
	it('never replays a sign-in step or its one-time code', () => {
		expect(welcomeTarget('/login/callback?code=abc&state=xyz')).toBe('/titles');
		expect(welcomeTarget('/login?redirect=/feed')).toBe('/titles');
	});

	it('remembers the page that was asked for, minus code and state', () => {
		expect(welcomeTarget('/feed')).toBe('/feed');
		expect(welcomeTarget('/posts/abc?sort=newest-first&code=1&state=2')).toBe('/posts/abc?sort=newest-first');
		expect(welcomeTarget('/titles/123/new?offset=30')).toBe('/titles/123/new?offset=30');
	});

	it('falls back to the communities page for the root, the welcome page, nothing, or another site', () => {
		for (const bad of [undefined, '', '/', '/welcome?redirect=/x', '/logout', '//evil.example/x', 'https://evil.example/', '/\\evil']) {
			expect(welcomeTarget(bad)).toBe('/titles');
		}
	});
});
