import { createHash, timingSafeEqual } from 'node:crypto';
import type { InternalApi, Self } from '@/api/generated';

export const COOKIE = 'ovl';

export type LiteSession = {
	linkId: string;
	accountId: string;
	pid: number;
	deviceClass: string;
	token: string;
	api: InternalApi;
	self: Self;
};

export function parseCookie(header: string | undefined, name: string): string | null {
	if (!header) {
		return null;
	}
	for (const part of header.split(';')) {
		const idx = part.indexOf('=');
		if (idx > 0 && part.slice(0, idx).trim() === name) {
			return decodeURIComponent(part.slice(idx + 1).trim());
		}
	}
	return null;
}

export function parseBearer(header: string | undefined): string | null {
	const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
	return m ? m[1]! : null;
}

/** Per-token form token: ties a POST to the token that the page was rendered for. */
export function csrfFor(token: string, secret: string): string {
	return createHash('sha256').update(`verse-lite-csrf:${secret}:${token}`).digest('hex').slice(0, 24);
}

export function csrfOk(token: string, secret: string, given: unknown): boolean {
	if (typeof given !== 'string') {
		return false;
	}
	const a = Buffer.from(csrfFor(token, secret));
	const b = Buffer.from(given);
	return a.length === b.length && timingSafeEqual(a, b);
}
