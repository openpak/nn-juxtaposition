import { createChannel, createClient, Metadata } from 'nice-grpc';
import { config } from '@/config';
import { logger } from '@/logger';
import { encodeGetProfileRequest, decodeMemberId, decodeProfile, webAccessFor } from '@/services/web-identity/parental';
import type { SupervisionLookup, WebAccess } from '@/services/web-identity/parental';

/* nice-grpc inspects the request with `in`, so it must be an object: a bare string throws a
 * TypeError, which fails closed for every account. */
export const parentalDefinition = {
	getProfile: {
		path: '/openpak.parental.v1.Parental/GetProfile',
		requestStream: false,
		responseStream: false,
		requestSerialize: (v: { memberId: string }): Buffer => Buffer.from(encodeGetProfileRequest(v.memberId)),
		requestDeserialize: (b: Buffer): { memberId: string } => ({ memberId: decodeMemberId(b) }),
		responseSerialize: (v: { supervised: boolean; openverse?: string }): Buffer => {
			const level = Buffer.from(v.openverse ?? '', 'utf8');
			return Buffer.concat([Buffer.from([0x08, v.supervised ? 1 : 0]), level.length ? Buffer.concat([Buffer.from([0x32, level.length]), level]) : Buffer.alloc(0)]);
		},
		responseDeserialize: (b: Buffer): { supervised: boolean; openverse?: string } => decodeProfile(b),
		options: {}
	}
} as const;

type ParentalClient = {
	getProfile(req: { memberId: string }, opts: { metadata: Metadata; signal: AbortSignal }): Promise<{ supervised: boolean; openverse?: string }>;
};

export function lookupVia(client: ParentalClient, key: string): SupervisionLookup {
	return async accountId => client.getProfile({ memberId: accountId }, {
		metadata: new Metadata({ 'x-internal-key': key }),
		signal: AbortSignal.timeout(3000)
	});
}

export function createConfiguredLookup(): SupervisionLookup | null {
	if (!config.parental.address) {
		return null;
	}
	const channel = createChannel(config.parental.address);
	return lookupVia(createClient(parentalDefinition as never, channel) as unknown as ParentalClient, config.parental.key);
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
	const access = await webAccessFor(accountId, lookup, e => logger.warn(e, 'Parental controls lookup failed, treating OpenVerse as off for the account'));
	if (cache.size > 5000) {
		cache.clear();
	}
	cache.set(key, { at: now, access });
	return access;
}
