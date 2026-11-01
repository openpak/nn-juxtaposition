/* OpenPak web accounts.
 *
 * Everything in this service is keyed by a number called "pid". A console account has a real one,
 * handed out by nn-account (1000000000 to 1799999999). A person who only uses the web has no
 * console account, so they get a number of their own from a Postgres sequence that starts at
 * 1800000001 (migration 20261101190000_web_identities), above anything nn-account issues.
 * The two ranges never meet, so a web-only identity cannot collide with a real PID, and the rest
 * of the service treats both kinds the same way.
 *
 * A person who has a Wii U linked uses their real PID on the web too. Console posts and web posts
 * are then the same user. */

import type { GetUserDataResponse } from '@pretendonetwork/grpc/account/v2/get_user_data_rpc';

/** Highest PID nn-account ever issues. */
export const MAX_CONSOLE_PID = 1_799_999_999;
/** First number of the web-only range. */
export const WEB_ONLY_PID_MIN = 1_800_000_001;
/** users.pid is a 32-bit integer. */
export const WEB_ONLY_PID_MAX = 2_147_483_647;

/**
 * The official Pakka account. A service identity inside the web-only range, far above where the
 * sequence will ever get. It has no web_identities row, so no sign-in can ever resolve to it: the
 * only way to post as it is the key-protected /internal/v1/official routes (services/official).
 */
export const OFFICIAL_PID = 2_000_000_000;
export const OFFICIAL_NAME = 'Pakka';

export function isOfficialPid(pid: number): boolean {
	return pid === OFFICIAL_PID;
}

export function isWebOnlyPid(pid: number): boolean {
	return Number.isInteger(pid) && pid >= WEB_ONLY_PID_MIN && pid <= WEB_ONLY_PID_MAX;
}

/** A PID the Wii U/3DS account server could have issued. */
export function isConsolePid(pid: unknown): pid is number {
	return typeof pid === 'number' && Number.isInteger(pid) && pid > 0 && pid <= MAX_CONSOLE_PID;
}

const NAME_MAX = 32;
export const DEFAULT_WEB_NAME = 'OpenPak player';

export function cleanDisplayName(name: string | null | undefined): string {
	// eslint-disable-next-line no-control-regex -- stripping control characters is the point
	const cleaned = (name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX).trim();
	return cleaned === '' ? DEFAULT_WEB_NAME : cleaned;
}

export type IdentityRow = {
	accountId: string;
	pid: number;
	linked: boolean;
	rulesAcceptedAt: Date | null;
};

type UserRow = { pid: number; displayName: string };

/** The few Prisma calls this module needs, so tests can pass a plain object. */
export type IdentityDb = {
	webIdentity: {
		findUnique(args: { where: { accountId: string } }): Promise<IdentityRow | null>;
		findFirst(args: { where: { pid: number } }): Promise<IdentityRow | null>;
		create(args: { data: { accountId: string; pid?: number; linked?: boolean } }): Promise<IdentityRow>;
		update(args: { where: { accountId: string }; data: Partial<Pick<IdentityRow, 'pid' | 'linked' | 'rulesAcceptedAt'>> }): Promise<IdentityRow>;
	};
	user: {
		findUnique(args: { where: { pid: number } }): Promise<UserRow | null>;
		create(args: { data: Record<string, unknown> }): Promise<unknown>;
		update(args: { where: { pid: number }; data: { displayName: string } }): Promise<unknown>;
	};
};

export type ResolvedIdentity = {
	pid: number;
	linked: boolean;
	rulesAccepted: boolean;
};

export type SsoIdentityInput = {
	accountId: string;
	displayName: string;
	wiiuPid: number | null;
};

function isUniqueViolation(e: unknown): boolean {
	return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/** Settings a new player starts with: the same defaults the console first-run page writes. */
export function defaultUserData(pid: number, displayName: string): Record<string, unknown> {
	return {
		pid,
		displayName,
		accountStatus: 0,
		lastSeen: new Date(),
		settings: {
			create: {
				gameSkill: 0,
				receiveNotifications: true,
				isFavouriteCommunityVisible: true,
				isGameSkillVisible: true,
				profilePrivacy: 'Public',
				isBirthdayVisible: false,
				isRelationshipVisible: false,
				isCountryVisible: false,
				profileComment: null,
				notifyEmpathy: true,
				notifyFollows: true,
				notifyReply: true
			}
		}
	};
}

/**
 * Finds or creates the OpenVerse user for an OpenPak account. Safe to call on every sign-in.
 * - A linked Wii U keeps its real PID. A person who first used the web only and links a console
 *   later moves to the real PID from then on; what they posted before stays under the old number.
 * - The first call creates the user and its settings, so nobody ever sees a first-run page.
 */
export async function resolveWebIdentity(db: IdentityDb, input: SsoIdentityInput): Promise<ResolvedIdentity> {
	const name = cleanDisplayName(input.displayName);
	const wiiuPid = isConsolePid(input.wiiuPid) ? input.wiiuPid : null;

	let identity = await db.webIdentity.findUnique({ where: { accountId: input.accountId } });
	if (!identity) {
		try {
			identity = await db.webIdentity.create({
				data: wiiuPid ? { accountId: input.accountId, pid: wiiuPid, linked: true } : { accountId: input.accountId }
			});
		} catch (e) {
			if (!isUniqueViolation(e)) {
				throw e;
			}
			// Two first sign-ins at once: the other one won.
			identity = await db.webIdentity.findUnique({ where: { accountId: input.accountId } });
			if (!identity) {
				throw e;
			}
		}
	} else if (wiiuPid && identity.pid !== wiiuPid) {
		identity = await db.webIdentity.update({ where: { accountId: input.accountId }, data: { pid: wiiuPid, linked: true } });
	}

	const user = await db.user.findUnique({ where: { pid: identity.pid } });
	if (!user) {
		try {
			await db.user.create({ data: defaultUserData(identity.pid, name) });
		} catch (e) {
			if (!isUniqueViolation(e)) {
				throw e;
			}
		}
	} else if (!identity.linked && user.displayName !== name) {
		// A web-only player's name follows their OpenPak account. A console player's name is their Mii's.
		await db.user.update({ where: { pid: identity.pid }, data: { displayName: name } });
	}

	return { pid: identity.pid, linked: identity.linked, rulesAccepted: identity.rulesAcceptedAt !== null };
}

export async function acceptRules(db: IdentityDb, pid: number, now = new Date()): Promise<boolean> {
	const identity = await db.webIdentity.findFirst({ where: { pid } });
	if (!identity) {
		return false;
	}
	await db.webIdentity.update({ where: { accountId: identity.accountId }, data: { rulesAcceptedAt: now } });
	return true;
}

/**
 * The account-server record for a person with no console account. Only the fields this service reads
 * are meaningful; there is no Mii, no console permission and no handle (the user page leaves it out).
 */
export function buildWebOnlyAccount(pid: number): GetUserDataResponse {
	return {
		deleted: false,
		pid,
		username: '',
		accessLevel: 0,
		serverAccessLevel: 'prod',
		mii: undefined,
		creationDate: '',
		birthdate: '',
		gender: '',
		country: '',
		language: '',
		emailAddress: '',
		tierName: '',
		permissions: undefined,
		linkedDevices: []
	} satisfies GetUserDataResponse;
}
