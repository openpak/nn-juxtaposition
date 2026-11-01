import { errors } from '@/services/internal/errors';
import type express from 'express';

/**
 * Checks the user account is valid for this request (not banned, setup complete, etc.)
 */
export async function authAccessCheck(request: express.Request, response: express.Response, next: express.NextFunction): Promise<void> {
	const account = response.locals.account;
	if (account === null) {
		// Guest access
		return next();
	}

	if (account.pnid.deleted) {
		response.locals.accountAuthError = errors.for('auth_account_deleted');
		return next();
	}

	if (account.pnid.accessLevel < 0 ||
		account.pnid.permissions?.bannedAllPermanently === true ||
		account.pnid.permissions?.bannedAllTemporarily === true) {
		response.locals.accountAuthError = errors.for('auth_account_network_banned');
		return next();
	}

	// TODO console linking check (needs account server support)

	if (account.user === null) {
		// Account hasn't completed initial setup yet
		// User guard will check this for endpoints that care
		// Still.. spooky
		return next();
	}

	// 0 = normal, 1 = limited from posting, 2 = temp ban, 3 = perma ban
	if (account.user.accountStatus !== 0 && account.user.accountStatus !== 1) {
		response.locals.accountAuthError = errors.for('auth_account_juxt_banned');
		return next();
	}

	return next();
}

/**
 * OpenVerse turned off by a parent: the web account may only ask who it is (so the site can say
 * why) and sign in or out. Everything else, reads included, is refused.
 */
export async function openverseOffGate(request: express.Request, response: express.Response, next: express.NextFunction): Promise<void> {
	const account = response.locals.account;
	if (account?.openverseOff && request.path !== '/api/v1/self' && !request.path.startsWith('/api/v1/sso/')) {
		throw errors.for('auth_openverse_off');
	}
	return next();
}

/**
 * A read-only account (supervised, web) may look but not change anything. Only the web UI can be
 * read-only, and accepting the rules stays allowed so the welcome page still works.
 */
export async function readOnlyGate(request: express.Request, response: express.Response, next: express.NextFunction): Promise<void> {
	const account = response.locals.account;
	const isWrite = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS';
	if (account?.readOnly && isWrite && !request.path.startsWith('/api/v1/sso/')) {
		throw errors.for('auth_read_only');
	}
	return next();
}
