import '@/extend-zod'; // Needs to be the first import
import { describe, expect, it } from 'vitest';
import { decodeSupervised, encodeGetProfileRequest, webAccessFor } from '@/services/web-identity/parental';
import { mapSelf } from '@/services/internal/contract/self';
import { isPostingAllowed } from '@/services/internal/utils/communities';
import { readOnlyGate } from '@/services/internal/middleware/auth-accesscheck';
import { buildWebOnlyAccount, WEB_ONLY_PID_MIN } from '@/services/web-identity/web-identity';
import type { AccountData } from '@/types/common/account-data';

describe('supervised accounts', () => {
	it('is full access when no parental controls core is configured', async () => {
		expect(await webAccessFor('acc', null)).toBe('full');
	});

	it('is full access for an account nobody supervises', async () => {
		expect(await webAccessFor('acc', async () => ({ supervised: false }))).toBe('full');
	});

	it('is read only for a supervised account', async () => {
		expect(await webAccessFor('acc', async () => ({ supervised: true }))).toBe('read_only');
	});

	it('fails closed: read only when the core cannot be reached', async () => {
		expect(await webAccessFor('acc', async () => {
			throw new Error('unavailable');
		})).toBe('read_only');
	});

	it('fails closed when checking is on but the account is unknown', async () => {
		expect(await webAccessFor(null, async () => ({ supervised: false }))).toBe('read_only');
	});
});

describe('GetProfile wire format', () => {
	it('encodes member_id as field 1', () => {
		const id = '11111111-2222-3333-4444-555555555555';
		const out = Buffer.from(encodeGetProfileRequest(id));
		expect(out[0]).toBe(0x0a);
		expect(out[1]).toBe(36);
		expect(out.subarray(2).toString()).toBe(id);
	});

	it('reads supervised and skips the other fields', () => {
		// supervised=true, profile_json="{}", profile_version=3
		const buf = Buffer.from([0x08, 0x01, 0x12, 0x02, 0x7b, 0x7d, 0x18, 0x03]);
		expect(decodeSupervised(buf)).toBe(true);
		expect(decodeSupervised(Buffer.from([0x12, 0x02, 0x7b, 0x7d]))).toBe(false);
		expect(decodeSupervised(Buffer.alloc(0))).toBe(false);
	});
});

function account(readOnly: boolean, accountStatus = 0): AccountData {
	return {
		pnid: buildWebOnlyAccount(WEB_ONLY_PID_MIN),
		user: {
			pid: WEB_ONLY_PID_MIN, displayName: 'Ada', accountStatus, followedCommunities: [], follows: [],
			pnid: null, pnidNormalized: null, createdAt: new Date(), lastSeen: new Date(), banReason: null, banEndsAt: null, bannedBy: null, settings: null
		} as never,
		moderator: false,
		developer: false,
		readOnly,
		rulesAccepted: true
	};
}

describe('what a read-only account can do', () => {
	const community = { type: 0, permissions: { open: true, minimum_new_post_access_level: 0, minimum_new_comment_access_level: 0 }, adminPids: [] };

	it('posts and replies for a normal web account', () => {
		const self = mapSelf(account(false));
		expect(self.permissions.posting).toBe(true);
		expect(isPostingAllowed(community as never, self, null)).toBe(true);
		expect(isPostingAllowed(community as never, self, { id: 'p' } as never)).toBe(true);
	});

	it('cannot post or reply when supervised', () => {
		const self = mapSelf(account(true));
		expect(self.readOnly).toBe(true);
		expect(self.permissions.posting).toBe(false);
		expect(isPostingAllowed(community as never, self, null)).toBe(false);
		expect(isPostingAllowed(community as never, self, { id: 'p' } as never)).toBe(false);
	});

	it('refuses writes (Yeah, follow, post) but allows reads and accepting the rules', async () => {
		const call = async (method: string, path: string, readOnly: boolean): Promise<string> => {
			const req = { method, path } as never;
			const res = { locals: { account: { readOnly } } } as never;
			try {
				await readOnlyGate(req, res, () => undefined as never);
				return 'ok';
			} catch (e) {
				return (e as { code: string }).code;
			}
		};
		expect(await call('POST', '/api/v1/posts/1/empathy', true)).toBe('auth_read_only');
		expect(await call('POST', '/api/v1/users/5/follow', true)).toBe('auth_read_only');
		expect(await call('POST', '/api/v1/communities/9/posts', true)).toBe('auth_read_only');
		expect(await call('GET', '/api/v1/communities', true)).toBe('ok');
		expect(await call('POST', '/api/v1/sso/accept-rules', true)).toBe('ok');
		expect(await call('POST', '/api/v1/posts/1/empathy', false)).toBe('ok');
	});
});
