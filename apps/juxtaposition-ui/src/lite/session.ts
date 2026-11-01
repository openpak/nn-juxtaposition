/* Resolve a device token to an OpenVerse session: token -> account (device-links table) -> the
 * number OpenVerse knows the person by -> a trusted-pid API client, the same path the web UI uses
 * after openpak.org sign-in. A revoked or unknown token resolves to nothing. */

import { createInternalApiClient } from '@/api/client';
import type { InternalApi } from '@/api/generated';
import type { UserTokens } from '@/types/juxt/tokens';
import type { LiteSession } from '@/lite/auth';

export type SessionDeps = {
	makeApi: (tokens: UserTokens) => InternalApi;
};

export const defaultDeps: SessionDeps = { makeApi: createInternalApiClient };

export type SessionResult =
	| { kind: 'ok'; session: LiteSession } |
	{ kind: 'none' } |
	{ kind: 'unavailable'; reason: 'banned' | 'no-profile' };

export async function loadSession(deps: SessionDeps, token: string | null, allowedClasses?: readonly string[]): Promise<SessionResult> {
	if (!token) {
		return { kind: 'none' };
	}
	const resolved = (await deps.makeApi({}).deviceLinks.resolve({ token })).data;
	if (!resolved || (allowedClasses && !allowedClasses.includes(resolved.deviceClass))) {
		return { kind: 'none' };
	}
	if (resolved.pid === null) {
		return { kind: 'unavailable', reason: 'no-profile' };
	}
	const api = deps.makeApi({ trustedPid: resolved.pid });
	const selfResult = await api.self.get({ throwOnError: false });
	const self = selfResult.error ? null : selfResult.data ?? null;
	if (!self) {
		return { kind: 'unavailable', reason: 'no-profile' };
	}
	if (self.banState) {
		return { kind: 'unavailable', reason: 'banned' };
	}
	return {
		kind: 'ok',
		session: { linkId: resolved.id, accountId: resolved.accountId, pid: resolved.pid, deviceClass: resolved.deviceClass, token, api, self }
	};
}
