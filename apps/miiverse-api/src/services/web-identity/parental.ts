/* Parental controls for web accounts.
 *
 * OpenVerse asks the OpenPak parental controls core (platforms/core/infra/parental, gRPC
 * Parental.GetProfile) whether an account is supervised. A supervised account can read and
 * cannot post, reply, Yeah or follow. There is no parent-facing OpenVerse setting in the core
 * yet, so "read only" is the whole policy for now (docs/web-sso.md, "Supervised accounts").
 *
 * Without PN_MIIVERSE_API_PARENTAL_ADDRESS there is no check. With it, a core that cannot be
 * reached means read only, never full access. */

export type WebAccess = 'full' | 'read_only';

export type SupervisionLookup = (accountId: string) => Promise<{ supervised: boolean }>;

export async function webAccessFor(accountId: string | null, lookup: SupervisionLookup | null, onError: (e: unknown) => void = () => undefined): Promise<WebAccess> {
	if (!lookup) {
		return 'full';
	}
	if (!accountId) {
		return 'read_only'; // checking is on and we cannot say who this is
	}
	try {
		const { supervised } = await lookup(accountId);
		return supervised ? 'read_only' : 'full';
	} catch (e) {
		onError(e);
		return 'read_only';
	}
}

/* Hand-written codecs for the two messages we use (proto/openpak/parental/v1/parental.proto):
 *   GetProfileRequest  { string member_id = 1; }
 *   GetProfileResponse { bool supervised = 1; ... } */

export function encodeGetProfileRequest(memberId: string): Uint8Array {
	const id = Buffer.from(memberId, 'utf8');
	const len: number[] = [];
	let n = id.length;
	while (n >= 0x80) {
		len.push((n & 0x7f) | 0x80);
		n >>>= 7;
	}
	len.push(n);
	return Buffer.concat([Buffer.from([0x0a]), Buffer.from(len), id]);
}

function readVarint(buf: Uint8Array, at: number): [number, number] {
	let result = 0;
	let shift = 0;
	let i = at;
	for (;;) {
		if (i >= buf.length || shift > 28) {
			throw new Error('bad varint');
		}
		const b = buf[i++]!;
		result += (b & 0x7f) * 2 ** shift;
		if ((b & 0x80) === 0) {
			return [result, i];
		}
		shift += 7;
	}
}

export function decodeSupervised(buf: Uint8Array): boolean {
	let i = 0;
	let supervised = false;
	while (i < buf.length) {
		let tag: number;
		[tag, i] = readVarint(buf, i);
		const field = Math.floor(tag / 8);
		const wire = tag & 7;
		if (wire === 0) {
			let v: number;
			[v, i] = readVarint(buf, i);
			if (field === 1) {
				supervised = v !== 0;
			}
		} else if (wire === 2) {
			let len: number;
			[len, i] = readVarint(buf, i);
			i += len;
		} else if (wire === 1) {
			i += 8;
		} else if (wire === 5) {
			i += 4;
		} else {
			throw new Error('unsupported wire type');
		}
	}
	return supervised;
}
