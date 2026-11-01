import express from 'express';
import { z } from 'zod';
import { config } from '@/config';
import { logger } from '@/logger';
import { finishSso, safeRedirect, startSso } from '@/sso';
import { WebNoWiiuView } from '@/services/juxt-web/views/web/noWiiuView';
import { parseReq } from '@/services/juxt-web/routes/routeUtils';
import { getDiscoveryStatusMessage } from '@/middleware/discovery';
import type { SsoSettings } from '@/sso';

export const loginRouter = express.Router();

function settings(): SsoSettings {
	return {
		clientId: config.sso.clientId,
		clientSecret: config.sso.clientSecret,
		authorizeUrl: config.sso.authorizeUrl,
		tokenUrl: config.sso.tokenUrl,
		redirectUri: new URL('/login/callback', config.http.baseUrl).toString()
	};
}

loginRouter.get('/', (req, res) => {
	const { query } = parseReq(req, {
		query: z.object({
			redirect: z.string().optional()
		})
	});

	const { url, pending } = startSso(settings(), safeRedirect(query.redirect));
	req.session.ssoPending = pending;
	return req.session.save(() => res.redirect(url));
});

loginRouter.get('/callback', async (req, res) => {
	const { query } = parseReq(req, {
		query: z.object({
			code: z.string().optional(),
			state: z.string().optional(),
			error: z.string().optional()
		})
	});
	const pending = req.session.ssoPending;
	req.session.ssoPending = undefined; // single use, whatever happens next

	const result = await finishSso(settings(), pending, query);
	if (!result.ok) {
		req.log.warn({ reason: result.reason }, 'SSO sign-in failed');
		if (result.reason === 'state_mismatch' || result.reason === 'no_pending' || result.reason === 'expired') {
			// Stale or forged callback: just start over.
			return res.redirect('/login');
		}
		return res.renderError({ code: 502, message: 'Sign-in with OpenPak is unavailable right now. Please try again in a moment.' });
	}

	const { identity, redirect } = result;
	if (identity.wiiuPid === null) {
		req.session.sso = undefined;
		return req.session.save(() => res.jsx(<WebNoWiiuView linkUrl={config.sso.linkUrl} />));
	}

	const { data: discovery } = await req.api.discovery.get({ environment: config.serverEnvironment });
	if (discovery.status !== 'open') {
		return res.renderError({
			code: 504,
			message: getDiscoveryStatusMessage(discovery.status)
		});
	}

	// Fresh session id after sign-in (fixation).
	req.session.regenerate((err) => {
		if (err) {
			logger.error(err, 'Failed to regenerate the session');
			return res.renderError({ code: 500, message: 'Error' });
		}
		req.session.sso = { accountId: identity.accountId, displayName: identity.displayName, wiiuPid: identity.wiiuPid };
		req.session.save(() => res.redirect(redirect));
	});
});
