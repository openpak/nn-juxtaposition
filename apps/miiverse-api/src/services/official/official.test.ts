import { describe, expect, it } from 'vitest';
import { composeBody, escapeRegex, keyMatches, POST_BODY_MAX, postIdFor, postUrl, titleIdForms } from '@/services/official/helpers';
import { renderPakkaAvatar, iconLetter } from '@/services/communities/seed-images';
import { isOfficialPid, isWebOnlyPid, OFFICIAL_PID } from '@/services/web-identity/web-identity';

describe('official key', () => {
	it('never matches when no key is configured', () => {
		expect(keyMatches('anything', '')).toBe(false);
		expect(keyMatches('', '')).toBe(false);
		expect(keyMatches(undefined, '')).toBe(false);
	});

	it('matches only the exact key', () => {
		expect(keyMatches('s3cret', 's3cret')).toBe(true);
		expect(keyMatches('s3cret ', 's3cret')).toBe(false);
		expect(keyMatches(undefined, 's3cret')).toBe(false);
		expect(keyMatches('', 's3cret')).toBe(false);
	});
});

describe('official post identity', () => {
	it('derives the same post id from the same event and different ids from different events', () => {
		expect(postIdFor('news:openpak_news:1')).toBe(postIdFor('news:openpak_news:1'));
		expect(postIdFor('news:openpak_news:1')).not.toBe(postIdFor('news:openpak_news:2'));
		expect(postIdFor('x')).toMatch(/^pk[0-9a-f]{19}$/);
	});

	it('builds the post address', () => {
		expect(postUrl('https://verse.openpak.org/', 'pkabc')).toBe('https://verse.openpak.org/posts/pkabc');
	});

	it('is a web-range service identity that no real account can be', () => {
		expect(isOfficialPid(OFFICIAL_PID)).toBe(true);
		expect(isOfficialPid(OFFICIAL_PID + 1)).toBe(false);
		expect(isWebOnlyPid(OFFICIAL_PID)).toBe(true);
	});
});

describe('composeBody', () => {
	it('keeps short text and adds the Discuss link', () => {
		expect(composeBody('Hello', null)).toBe('Hello');
		expect(composeBody('Hello', 'https://v/posts/1')).toBe('Hello\nDiscuss: https://v/posts/1');
	});

	it('shortens the text, never the link, and stays within the limit', () => {
		const url = 'https://verse.openpak.org/posts/pk0123456789abcdef012';
		const out = composeBody('word '.repeat(200), url);
		expect(out.length).toBeLessThanOrEqual(POST_BODY_MAX);
		expect(out.endsWith(`\nDiscuss: ${url}`)).toBe(true);
		expect(out).toContain('…');
	});

	it('refuses a link that leaves no room', () => {
		expect(() => composeBody('x', 'h'.repeat(300))).toThrow();
	});
});

describe('title ids and names', () => {
	it('tries hex and decimal forms', () => {
		expect(titleIdForms('0005000010101900')).toContain(BigInt('0x0005000010101900').toString());
		expect(titleIdForms('123')).toEqual(['123']);
	});

	it('escapes regex characters in names', () => {
		expect(new RegExp(`^${escapeRegex('Wii U (3DS) + more?')}$`).test('Wii U (3DS) + more?')).toBe(true);
	});
});

describe('Pakka avatar', () => {
	it('is a deterministic square PNG', () => {
		const a = renderPakkaAvatar(128);
		expect(a.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
		expect(a.equals(renderPakkaAvatar(128))).toBe(true);
	});

	it('community icons find a letter for any name', () => {
		expect(iconLetter('Splatoon 3')).toBe('S');
		expect(iconLetter('  3D World')).toBe('3');
		expect(iconLetter('???')).toBe('O');
	});
});
