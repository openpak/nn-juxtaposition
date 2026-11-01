import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * openpak.org single sign-on (authorization code flow, see the website's docs/sso.md).
 * Pure helpers: no config or Express imports, so they can be unit tested.
 */

export type SsoSettings = {
	clientId: string;
	clientSecret: string;
	/** https://openpak.org/account/sso/authorize */
	authorizeUrl: string;
	/** http://openpak-website:20010/internal/sso/token (private network only) */
	tokenUrl: string;
	/** https://verse.openpak.org/login/callback */
	redirectUri: string;
};

/** Kept in the server-side session between the redirect and the callback. */
export type SsoPending = {
	state: string;
	verifier: string;
	redirect: string;
	created: number;
};

export type SsoIdentity = {
	accountId: string;
	displayName: string;
	wiiuPid: number | null;
};

export type SsoFailure = 'state_mismatch' | 'no_pending' | 'expired' | 'exchange_failed' | 'bad_response';

export type SsoResult =
	| { ok: true; identity: SsoIdentity; redirect: string } |
	{ ok: false; reason: SsoFailure };

const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

function b64url(buf: Buffer): string {
	return buf.toString('base64url');
}

export function startSso(settings: SsoSettings, redirect: string, now = Date.now()): { url: string; pending: SsoPending } {
	const state = b64url(randomBytes(24));
	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash('sha256').update(verifier).digest());
	const url = new URL(settings.authorizeUrl);
	url.searchParams.set('client', settings.clientId);
	url.searchParams.set('redirect_uri', settings.redirectUri);
	url.searchParams.set('state', state);
	url.searchParams.set('code_challenge', challenge);
	url.searchParams.set('code_challenge_method', 'S256');
	return { url: url.toString(), pending: { state, verifier, redirect, created: now } };
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Only relative paths on this site are allowed as a post-login destination. */
export function safeRedirect(redirect: string | undefined): string {
	if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/\\')) {
		return '/';
	}
	if (redirect.startsWith('/login')) {
		return '/';
	}
	return redirect;
}

export async function finishSso(
	settings: SsoSettings,
	pending: SsoPending | undefined,
	query: { code?: string; state?: string },
	fetchFn: typeof fetch = fetch,
	now = Date.now()
): Promise<SsoResult> {
	if (!pending) {
		return { ok: false, reason: 'no_pending' };
	}
	if (now - pending.created > PENDING_MAX_AGE_MS) {
		return { ok: false, reason: 'expired' };
	}
	if (!query.state || !query.code || !safeEqual(query.state, pending.state)) {
		return { ok: false, reason: 'state_mismatch' };
	}

	const body = new URLSearchParams({
		code: query.code,
		redirect_uri: settings.redirectUri,
		code_verifier: pending.verifier
	});
	const basic = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
	let response: Response;
	try {
		response = await fetchFn(settings.tokenUrl, {
			method: 'POST',
			headers: {
				'authorization': `Basic ${basic}`,
				'content-type': 'application/x-www-form-urlencoded'
			},
			body: body.toString(),
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		return { ok: false, reason: 'exchange_failed' };
	}
	if (!response.ok) {
		return { ok: false, reason: 'exchange_failed' };
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch {
		return { ok: false, reason: 'bad_response' };
	}
	const data = json as { account_id?: unknown; display_name?: unknown; wiiu_pid?: unknown };
	if (typeof data.account_id !== 'string' || data.account_id === '') {
		return { ok: false, reason: 'bad_response' };
	}
	const wiiuPid = typeof data.wiiu_pid === 'number' && Number.isInteger(data.wiiu_pid) && data.wiiu_pid > 0 ? data.wiiu_pid : null;
	return {
		ok: true,
		redirect: safeRedirect(pending.redirect),
		identity: {
			accountId: data.account_id,
			displayName: typeof data.display_name === 'string' ? data.display_name : '',
			wiiuPid
		}
	};
}
