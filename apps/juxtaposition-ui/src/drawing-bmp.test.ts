import { describe, expect, it } from 'vitest';
import { encodeBmp1, toBase64 } from '../webfiles/web/js/bmp';

describe('web drawing as a 1-bit BMP', () => {
	it('is a valid 320x120 bottom-up BMP with a black and white palette', () => {
		const ink = new Uint8Array(320 * 120);
		const bmp = encodeBmp1(320, 120, ink);
		const view = new DataView(bmp.buffer);
		expect(String.fromCharCode(bmp[0]!, bmp[1]!)).toBe('BM');
		expect(view.getUint32(2, true)).toBe(bmp.length);
		expect(view.getUint32(10, true)).toBe(62);
		expect(view.getInt32(18, true)).toBe(320);
		expect(view.getInt32(22, true)).toBe(120);
		expect(view.getUint16(28, true)).toBe(1);
		expect(view.getUint32(30, true)).toBe(0);
		expect(Array.from(bmp.subarray(54, 62))).toEqual([0, 0, 0, 0, 255, 255, 255, 0]);
		expect(bmp.length).toBe(62 + 40 * 120);
	});

	it('writes ink as palette 0 (black) and paper as 1 (white), rows bottom to top', () => {
		const ink = new Uint8Array(320 * 120);
		ink[0] = 1; // top left pixel
		ink[119 * 320 + 319] = 1; // bottom right pixel
		const bmp = encodeBmp1(320, 120, ink);
		const pixels = bmp.subarray(62);
		// the file's first stored row is the picture's last row
		expect(pixels[0]).toBe(0xff); // bottom row, bits 0..7 white
		expect(pixels[39]).toBe(0xfe); // bottom row, last pixel (x=319) is ink
		const topRow = pixels.subarray(119 * 40, 120 * 40);
		expect(topRow[0]).toBe(0x7f); // first pixel is ink
		expect(topRow[1]).toBe(0xff);
	});

	it('base64 round-trips', () => {
		const bmp = encodeBmp1(320, 120, new Uint8Array(320 * 120));
		expect(Buffer.from(toBase64(bmp), 'base64').equals(Buffer.from(bmp))).toBe(true);
	});
});
