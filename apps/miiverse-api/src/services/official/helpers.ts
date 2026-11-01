/* Pure helpers for the official Pakka account (see official.ts). Kept free of database and network
 * imports so they are unit-testable on their own. */

import crypto from 'node:crypto';

/** Longest post body the service accepts (validateAndProcessPostBody in internal/utils/posts.ts). */
export const POST_BODY_MAX = 280;

/** True when `given` is the configured key. An empty configured key never matches. */
export function keyMatches(given: string | undefined, expected: string): boolean {
	if (expected === '' || !given) {
		return false;
	}
	const a = crypto.createHash('sha256').update(given).digest();
	const b = crypto.createHash('sha256').update(expected).digest();
	return crypto.timingSafeEqual(a, b);
}

/**
 * The post id for an event. Deterministic, so the same event always names the same post: that is
 * the idempotency key, and it also means the post's address is known before it exists.
 */
export function postIdFor(eventId: string): string {
	return 'pk' + crypto.createHash('sha256').update(`official-post:${eventId}`).digest('hex').slice(0, 19);
}

/** The address of a post on the web. */
export function postUrl(baseUrl: string, postId: string): string {
	return `${baseUrl.replace(/\/$/, '')}/posts/${postId}`;
}

/**
 * The text of a post: the given text, then (optionally) a Discuss link, within the body limit. The
 * text is shortened with an ellipsis, never the link.
 */
export function composeBody(text: string, discussUrl: string | null): string {
	const clean = text.replaceAll('\r\n', '\n').trim();
	const tail = discussUrl ? `\nDiscuss: ${discussUrl}` : '';
	const room = POST_BODY_MAX - tail.length;
	if (room < 20) {
		throw new Error('discuss link leaves no room for text');
	}
	if (clean.length <= room) {
		return clean + tail;
	}
	return clean.slice(0, room - 1).trimEnd() + '…' + tail;
}

/** A title id as the decimal string communities store, from either hex or decimal input. */
export function titleIdForms(titleId: string): string[] {
	const t = titleId.trim().toLowerCase();
	const out = new Set<string>([t]);
	if (/^[0-9a-f]{16}$/.test(t)) {
		out.add(BigInt('0x' + t).toString());
	}
	return [...out];
}

/** Escapes a string for use inside a regular expression. */
export function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
