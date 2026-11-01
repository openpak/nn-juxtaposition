import { createChannel, createClient, Metadata } from 'nice-grpc';
import { config } from '@/config';
import { logger } from '@/logger';
import { encodeGetProfileRequest, decodeSupervised, webAccessFor } from '@/services/web-identity/parental';
import type { SupervisionLookup, WebAccess } from '@/services/web-identity/parental';

const parentalDefinition = {
	getProfile: {
		path: '/openpak.parental.v1.Parental/GetProfile',
		requestStream: false,
		responseStream: false,
		requestSerialize: (v: string): Buffer => Buffer.from(encodeGetProfileRequest(v)),
		requestDeserialize: (b: Buffer): string => b.toString(),
		responseSerialize: (v: boolean): Buffer => Buffer.from([0x08, v ? 1 : 0]),
		responseDeserialize: (b: Buffer): boolean => decodeSupervised(b),
		options: {}
	}
} as const;

export function createConfiguredLookup(): SupervisionLookup | null {
	if (!config.parental.address) {
		return null;
	}
	const channel = createChannel(config.parental.address);
	const client = createClient(parentalDefinition as never, channel) as unknown as {
		getProfile(memberId: string, opts: { metadata: Metadata; signal: AbortSignal }): Promise<boolean>;
	};
	return async (accountId) => {
		const supervised = await client.getProfile(accountId, {
			metadata: new Metadata({ 'x-internal-key': config.parental.key }),
			signal: AbortSignal.timeout(3000)
		});
		return { supervised };
	};
}

// A parent's change should show up quickly, but not cost one gRPC call per page view.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; access: WebAccess }>();
let lookup: SupervisionLookup | null | undefined;

export async function getWebAccess(accountId: string | null, now = Date.now()): Promise<WebAccess> {
	if (lookup === undefined) {
		lookup = createConfiguredLookup();
	}
	if (!lookup) {
		return 'full';
	}
	const key = accountId ?? '';
	const hit = cache.get(key);
	if (hit && now - hit.at < CACHE_MS) {
		return hit.access;
	}
	const access = await webAccessFor(accountId, lookup, e => logger.warn(e, 'Parental controls lookup failed, treating the account as read only'));
	if (cache.size > 5000) {
		cache.clear();
	}
	cache.set(key, { at: now, access });
	return access;
}
