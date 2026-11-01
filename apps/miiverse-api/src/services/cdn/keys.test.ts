import { describe, expect, it } from 'vitest';
import { contentTypeFor, toCdnKey } from '@/services/cdn/keys';

describe('toCdnKey', () => {
	it('serves the prefixes the API writes', () => {
		expect(toCdnKey('paintings/1750000000/123.png')).toBe('paintings/1750000000/123.png');
		expect(toCdnKey('/screenshots/1/2-thumb.jpg')).toBe('screenshots/1/2-thumb.jpg');
		expect(toCdnKey('icons/abc/32.png')).toBe('icons/abc/32.png');
		expect(toCdnKey('headers/abc/3DS.jpg')).toBe('headers/abc/3DS.jpg');
		expect(toCdnKey('mii/1750000000/normal_face.png')).toBe('mii/1750000000/normal_face.png');
	});

	it('refuses other prefixes', () => {
		expect(toCdnKey('boss/anything')).toBeNull();
		expect(toCdnKey('')).toBeNull();
		expect(toCdnKey('paintings')).toBeNull();
	});

	it('refuses traversal and odd input', () => {
		expect(toCdnKey('paintings/../boss/x')).toBeNull();
		expect(toCdnKey('paintings/%2e%2e/boss/x')).toBeNull();
		expect(toCdnKey('paintings//x.png')).toBeNull();
		expect(toCdnKey('paintings/a\\b.png')).toBeNull();
		expect(toCdnKey('paintings/a%00.png')).toBeNull();
		expect(toCdnKey('paintings/%zz')).toBeNull();
		expect(toCdnKey('paintings/' + 'a'.repeat(300))).toBeNull();
	});
});

describe('contentTypeFor', () => {
	it('maps extensions', () => {
		expect(contentTypeFor('a.png')).toBe('image/png');
		expect(contentTypeFor('a.JPG')).toBe('image/jpeg');
		expect(contentTypeFor('a.tga')).toBe('image/x-tga');
		expect(contentTypeFor('a.bin')).toBe('application/octet-stream');
	});
});
