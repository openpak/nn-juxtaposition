/* Device links: a console (PS3, Wii, DSi browsers, the Xbox 360 dashboard) that was linked to an
 * OpenPak account with a short code. The person approves the code on verse.openpak.org while signed
 * in through openpak.org; the console then holds a long-lived token for that account. Only the
 * SHA-256 of the token is stored. A link can be revoked at any time (OpenVerse "Linked devices"),
 * and a revoked or unknown token resolves to nothing. */

import { createHash, randomBytes } from 'node:crypto';

export const DEVICE_CLASSES = ['ps3', 'wii', 'dsi', 'x360', 'lite'] as const;
export type DeviceClass = typeof DEVICE_CLASSES[number];

export const DEVICE_LABELS: Record<DeviceClass, string> = {
	ps3: 'PlayStation 3',
	wii: 'Wii',
	dsi: 'Nintendo DSi',
	x360: 'Xbox 360',
	lite: 'Other browser'
};

/** Active links one account may hold; keeps a stolen session from minting tokens forever. */
export const MAX_ACTIVE_LINKS = 12;
/** last_used_at is written at most this often per link. */
const TOUCH_INTERVAL_MS = 60_000;

export type DeviceLinkRow = {
	id: string;
	accountId: string;
	deviceClass: string;
	label: string;
	tokenHash: string;
	createdAt: Date;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
};

/** The few Prisma calls this module needs, so tests can pass a plain object. */
export type DeviceLinkDb = {
	deviceLink: {
		count(args: { where: { accountId: string; revokedAt: null } }): Promise<number>;
		create(args: { data: { accountId: string; deviceClass: string; label: string; tokenHash: string } }): Promise<DeviceLinkRow>;
		findUnique(args: { where: { tokenHash: string } }): Promise<DeviceLinkRow | null>;
		findMany(args: { where: { accountId: string }; orderBy: { createdAt: 'desc' } }): Promise<DeviceLinkRow[]>;
		updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
	};
	webIdentity: {
		findUnique(args: { where: { accountId: string } }): Promise<{ pid: number } | null>;
	};
};

export function isDeviceClass(v: unknown): v is DeviceClass {
	return typeof v === 'string' && (DEVICE_CLASSES as readonly string[]).includes(v);
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function newToken(): string {
	return 'ovd1.' + randomBytes(32).toString('base64url');
}

export type CreatedLink = { id: string; token: string; deviceClass: DeviceClass; label: string };

/** Mint a token for an approved link. Returns null when the account holds too many links. */
export async function createDeviceLink(db: DeviceLinkDb, input: { accountId: string; deviceClass: DeviceClass }): Promise<CreatedLink | null> {
	const active = await db.deviceLink.count({ where: { accountId: input.accountId, revokedAt: null } });
	if (active >= MAX_ACTIVE_LINKS) {
		return null;
	}
	const token = newToken();
	const label = DEVICE_LABELS[input.deviceClass];
	const row = await db.deviceLink.create({
		data: { accountId: input.accountId, deviceClass: input.deviceClass, label, tokenHash: hashToken(token) }
	});
	return { id: row.id, token, deviceClass: input.deviceClass, label };
}

export type ResolvedLink = { id: string; accountId: string; pid: number | null; deviceClass: DeviceClass };

/** Look a token up. `pid` is the account's current OpenVerse number (it can change when a Wii U is linked later). */
export async function resolveDeviceToken(db: DeviceLinkDb, token: string, now: Date = new Date()): Promise<ResolvedLink | null> {
	if (!token.startsWith('ovd1.') || token.length > 100) {
		return null;
	}
	const row = await db.deviceLink.findUnique({ where: { tokenHash: hashToken(token) } });
	if (!row || row.revokedAt || !isDeviceClass(row.deviceClass)) {
		return null;
	}
	if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
		await db.deviceLink.updateMany({ where: { id: row.id }, data: { lastUsedAt: now } });
	}
	const identity = await db.webIdentity.findUnique({ where: { accountId: row.accountId } });
	return { id: row.id, accountId: row.accountId, pid: identity?.pid ?? null, deviceClass: row.deviceClass };
}

export type DeviceLinkView = { id: string; deviceClass: string; label: string; createdAt: Date; lastUsedAt: Date | null };

export async function listDeviceLinks(db: DeviceLinkDb, accountId: string): Promise<DeviceLinkView[]> {
	const rows = await db.deviceLink.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' } });
	return rows
		.filter(r => !r.revokedAt)
		.map(r => ({ id: r.id, deviceClass: r.deviceClass, label: r.label, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt }));
}

/** Revoke one link of this account. False when it does not exist or is already revoked. */
export async function revokeDeviceLink(db: DeviceLinkDb, accountId: string, id: string, now: Date = new Date()): Promise<boolean> {
	const res = await db.deviceLink.updateMany({ where: { id, accountId, revokedAt: null }, data: { revokedAt: now } });
	return res.count > 0;
}
