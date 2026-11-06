/* Short link codes (OAuth device-flow style).
 *
 * A console asks for a code and shows it. The person types it at verse.openpak.org/devices while
 * signed in through openpak.org (HTTPS), and confirms. The console keeps polling with a secret that
 * only it holds; the first poll after approval receives a token, once. The code itself is not a
 * credential: without the poll secret it grants nothing. Codes live ten minutes in Postgres (ui_kv). */

import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { DeviceClass } from '@/lite/types';

/** No 0/O/1/I/L, so a code read off a small screen is hard to mistype. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_TTL_SECONDS = 600;

/** The three key-value calls used, so tests can pass a Map. */
export type KV = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, options: { EX: number }): Promise<unknown>;
	getDel(key: string): Promise<string | null>;
};

export type CodeEntry = {
	deviceClass: DeviceClass;
	secretHash: string;
	ip: string;
	createdAt: number;
	/** Set when the person approved the code on the web */
	accountId: string | null;
};

const key = (code: string): string => `verse-lite:code:${code}`;

export function newCode(): string {
	let out = '';
	for (let i = 0; i < CODE_LENGTH; i++) {
		out += ALPHABET[randomInt(ALPHABET.length)];
	}
	return out;
}

/** "abc 23x" -> "ABC23X"; null if it cannot be a code. */
export function normalizeCode(input: string | undefined | null): string | null {
	const code = (input ?? '').toUpperCase().replace(/[\s-]/g, '');
	if (code.length !== CODE_LENGTH) {
		return null;
	}
	for (const ch of code) {
		if (!ALPHABET.includes(ch)) {
			return null;
		}
	}
	return code;
}

export function displayCode(code: string): string {
	return `${code.slice(0, 3)}-${code.slice(3)}`;
}

const hash = (secret: string): string => createHash('sha256').update(secret).digest('hex');

export async function startLink(kv: KV, input: { deviceClass: DeviceClass; ip: string }, now = Date.now()): Promise<{ code: string; secret: string }> {
	const secret = randomBytes(18).toString('base64url');
	for (let attempt = 0; attempt < 8; attempt++) {
		const code = newCode();
		if (await kv.get(key(code))) {
			continue;
		}
		const entry: CodeEntry = { deviceClass: input.deviceClass, secretHash: hash(secret), ip: input.ip, createdAt: now, accountId: null };
		await kv.set(key(code), JSON.stringify(entry), { EX: CODE_TTL_SECONDS });
		return { code, secret };
	}
	throw new Error('Could not find a free link code');
}

export async function peekCode(kv: KV, code: string): Promise<CodeEntry | null> {
	const raw = await kv.get(key(code));
	return raw ? (JSON.parse(raw) as CodeEntry) : null;
}

/** The person approved the code. False if it is gone, expired or already approved. */
export async function approveCode(kv: KV, code: string, accountId: string): Promise<boolean> {
	const entry = await peekCode(kv, code);
	if (!entry || entry.accountId) {
		return false;
	}
	entry.accountId = accountId;
	const left = Math.max(30, CODE_TTL_SECONDS - Math.floor((Date.now() - entry.createdAt) / 1000));
	await kv.set(key(code), JSON.stringify(entry), { EX: left });
	return true;
}

export type PollResult =
	| { status: 'pending' } |
	{ status: 'gone' } |
	{ status: 'approved'; accountId: string; deviceClass: DeviceClass };

/** The console polls. An approved code is consumed by the first poll that proves the secret. */
export async function pollCode(kv: KV, code: string, secret: string, ip: string): Promise<PollResult> {
	const entry = await peekCode(kv, code);
	if (!entry || entry.secretHash !== hash(secret) || entry.ip !== ip) {
		return { status: 'gone' };
	}
	if (!entry.accountId) {
		return { status: 'pending' };
	}
	// GETDEL makes "first poll wins" atomic: a second concurrent poll sees nothing.
	if (!await kv.getDel(key(code))) {
		return { status: 'gone' };
	}
	return { status: 'approved', accountId: entry.accountId, deviceClass: entry.deviceClass };
}
