import { getUserAccountData, getUserDataFromServiceToken, getUserDataFromToken, getValueFromHeaders } from '@/util';
import { errors } from '@/services/internal/errors';
import { getDb, getUser } from '@/database';
import { isWebOnlyPid } from '@/services/web-identity/web-identity';
import { getWebAccess } from '@/services/web-identity/access';
import type express from 'express';
import type { GetUserDataResponse } from '@pretendonetwork/grpc/account/v2/get_user_data_rpc';

/**
 * Handles authentication for service (NNAS/console) and OAuth (web) tokens. Sets locals.account to AccountData.
 * Will error if tokens bad or account nonexistent, but otherwise does not check bans or setup status.
 */
export async function authPopulate(request: express.Request, response: express.Response, next: express.NextFunction): Promise<void> {
	// Used by console applets
	const serviceToken = getValueFromHeaders(request.headers, 'x-service-token');
	// Used by web frontend
	const oAuthToken = getValueFromHeaders(request.headers, 'x-oauth-token');

	// Used by the web frontend after openpak.org single sign-on: the UI already verified the person and
	// vouches for their Wii U PID. This app is only reachable through the API-key-protected gRPC channel
	// (see server.ts), so the header cannot come from a browser or a console.
	const trustedPid = getValueFromHeaders(request.headers, 'x-trusted-pid');

	if ([serviceToken, oAuthToken, trustedPid].filter(Boolean).length > 1) {
		throw errors.for('bad_request', 'Multiple authentication tokens provided');
	}

	let pnid: GetUserDataResponse | null = null;
	if (serviceToken) {
		pnid = await consoleAuth(request, serviceToken);
	} else if (oAuthToken) {
		pnid = await webAuth(request, oAuthToken);
	} else if (trustedPid) {
		pnid = await trustedAuth(trustedPid);
	}

	if (pnid !== null) {
		// Null here just means the initial setup isn't done
		const user = await getUser(pnid.pid);

		const moderator = accountIsModerator(pnid);
		const developer = accountIsDeveloper(pnid);

		// Only the web UI sends x-trusted-pid; its identity row says who the person is and whether
		// they have accepted the rules / are supervised.
		let readOnly = false;
		let rulesAccepted = true;
		if (trustedPid) {
			const identity = await getDb().webIdentity.findFirst({ where: { pid: pnid.pid } });
			rulesAccepted = identity ? identity.rulesAcceptedAt !== null : true;
			readOnly = (await getWebAccess(identity?.accountId ?? null)) === 'read_only';
		}

		response.locals.account = { pnid, user, moderator, developer, readOnly, rulesAccepted };
	} else {
		// Guest access
		response.locals.account = null;
	}

	return next();
}

async function consoleAuth(_request: express.Request, serviceToken: string): Promise<GetUserDataResponse> {
	const pnid: GetUserDataResponse | null = await getUserDataFromServiceToken(serviceToken);
	if (!pnid) {
		throw errors.for('unauthorized', 'Invalid service token!');
	}
	return pnid;
}

async function webAuth(request: express.Request, oAuthToken: string): Promise<GetUserDataResponse> {
	// The "normal" getUserData API (used here) is mutually incompatible with the "backdoor" one.
	// Since we can only use the backdoor one for consoles right now...
	const pid = (await getUserDataFromToken(oAuthToken).catch((e) => {
		// TODO should probably check the error type here in case of e.g. connection refused
		request.log.error(e, 'Failed to get user data from OAuth token');
		throw errors.for('unauthorized', 'Invalid OAuth token!');
	})).pid;
	// Ask the "backdoor" API, just use the above as a glorified token decryption.
	const pnid = await getUserAccountData(pid);

	return pnid;
}

async function trustedAuth(trustedPid: string): Promise<GetUserDataResponse> {
	if (!/^[1-9][0-9]{0,15}$/.test(trustedPid)) {
		throw errors.for('bad_request', 'Invalid trusted PID');
	}
	if (isWebOnlyPid(Number(trustedPid))) {
		// No console account behind this one: the identity row and the user row are all there is.
		const known = await getUser(Number(trustedPid));
		if (!known) {
			throw errors.for('unauthorized', 'Unknown account!');
		}
	}
	return await getUserAccountData(Number(trustedPid)).catch(() => {
		throw errors.for('unauthorized', 'Unknown account!');
	});
}

function accountIsModerator(pnid: GetUserDataResponse): boolean {
	// AL2 can always moderate...
	if (pnid.accessLevel >= 2) {
		return true;
	}

	// Lower-level accounts can also have permission granted
	if (pnid.permissions?.moderateMiiverse === true) {
		return true;
	}

	return false;
}

function accountIsDeveloper(pnid: GetUserDataResponse): boolean {
	if (pnid.accessLevel === 3) {
		return true;
	}

	return false;
}
