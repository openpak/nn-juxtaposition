import { createInternalApiClient } from '@/api/client';
import { logger } from '@/logger';
import { isWelcomeExempt, welcomeTarget } from '@/sso';
import { getUserAccountData } from '@/util';
import type { RequestHandler, Request, Response } from 'express';

export const webAuth: RequestHandler = async (request, response, next) => {
	// The web UI signs in through openpak.org SSO only (see routes/web/login.tsx). The session holds the
	// account and the number OpenVerse knows it by (a Wii U PID, or a web-only number); the miiverse-api
	// is told who we are with the trusted `x-trusted-pid` header, which only this UI can set (the API's
	// internal routes are reachable over gRPC with the API key only).
	const sso = request.session?.sso;
	if (sso) {
		try {
			if (!sso.pid) {
				// Signed in before web-only accounts existed: set the user up now.
				const { data } = await createInternalApiClient({}).sso.resolve({
					accountId: sso.accountId,
					displayName: sso.displayName,
					wiiuPid: sso.wiiuPid
				});
				sso.pid = data.pid;
			}
			const pid = sso.pid;
			request.pid = pid;
			if (!request.session.user || request.session.pid !== pid) {
				request.session.user = await getUserAccountData(pid);
				request.session.pid = pid;
			}
			request.user = request.session.user;
			response.locals.displayName = sso.displayName;
		} catch (e) {
			logger.error(e, 'Failed to load the account for the SSO session');
			request.pid = null;
			request.user = null;
			request.session.sso = undefined;
			request.session.user = null;
			request.session.pid = null;
		}
	}

	request.tokens = request.pid ? { trustedPid: request.pid } : {};

	request.self = null;
	if (request.user) {
		const selfResult = await createInternalApiClient(request.tokens).self.get({ throwOnError: false });
		if (selfResult.error) {
			logger.error(selfResult.error, 'Failed to get self from the session');
		}
		request.self = selfResult.error ? null : selfResult.data ?? null;
	}

	// Handle guest access pages
	if (!request.pid || !request.user || !request.self) {
		if (!requestOkForGuest(request)) {
			return loginWall(request, response);
		}

		request.pid = 1000000000;
		response.locals.pid = request.pid;
		return next();
	}

	if (request.pid && request.path === '/login') {
		return response.redirect('/titles');
	}

	// First visit: show the community rules once before anything else.
	if (!request.self.hasAcceptedRules && !isWelcomeExempt(request.path)) {
		return response.redirect(`/welcome?redirect=${encodeURIComponent(welcomeTarget(request.originalUrl))}`);
	}

	response.locals.pid = request.pid;
	return next();
};

function isStartOfPath(path: string, value: string): boolean {
	return path.indexOf(value) === 0;
}

function requestOkForGuest(req: Request): boolean {
	const guestAccessPage =
		isStartOfPath(req.path, '/users/') ||
		(isStartOfPath(req.path, '/titles/') && req.path !== '/titles/show') ||
		(isStartOfPath(req.path, '/posts/') && !req.path.includes('/empathy'));

	const loginPage = req.path === '/login' || req.path === '/login/callback' || req.path === '/about' || req.path === '/logout';

	// login page is always ok
	// guest access pages must not be writes and the instance must have guest enabled
	return loginPage || (guestAccessPage && !req.isWrite && req.guest_access);
}

export function loginWall(req: Request, res: Response): void {
	let path = req.originalUrl;

	// bit rude to log someone in and 404 them right after
	if (path === '/404') {
		req.log.error('Likely bad guest route handler, will bail to homepage');
		path = '/';
	}

	req.session.user = null;
	return res.redirect(`/login?redirect=${encodeURIComponent(path)}`);
}
