import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { inflate } from 'pako';
import { ImageMagick, initializeImageMagick } from '@imagemagick/magick-wasm';

// images.ts pulls in the config; this test only needs its pure drawing code.
process.env.SKIP_CONFIG_VALIDATION = 'true';
const { processBmpPainting } = await import('@/images');
// The encoder the web page runs, loaded from the UI app (a different package, so not a type import)
const bmpModule: { encodeBmp1(w: number, h: number, ink: Uint8Array): Uint8Array } = await import(String(new URL('../../juxtaposition-ui/webfiles/web/js/bmp.ts', import.meta.url)));
const { encodeBmp1 } = bmpModule;

/**
 * The web canvas posts a 1-bit BMP with bmp=true. This runs it through the server's own console
 * drawing pipeline and checks what comes out is what a Wii U/3DS reads: a 320x120 zlib-compressed
 * TGA, plus the PNGs the web shows.
 */
describe('web drawing through the console drawing pipeline', () => {
	it('becomes the 320x120 compressed TGA the consoles read, with the same pixels', async () => {
		const wasm = await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')));
		await initializeImageMagick(wasm);

		// a diagonal line plus a filled 20x20 square at the top left
		const ink = new Uint8Array(320 * 120);
		for (let i = 0; i < 120; i++) {
			ink[i * 320 + i] = 1;
		}
		for (let y = 0; y < 20; y++) {
			for (let x = 0; x < 20; x++) {
				ink[y * 320 + x + 200] = 1;
			}
		}
		const painting = processBmpPainting(Buffer.from(encodeBmp1(320, 120, ink)));

		// TGAZ: zlib-deflated TGA, true colour, 32 bit, bottom-left origin
		const tga = inflate(painting.tgaz);
		expect(tga[2]).toBe(2); // uncompressed true colour
		expect(tga[16]).toBe(32);
		expect(tga[12] | (tga[13]! << 8)).toBe(320);
		expect(tga[14] | (tga[15]! << 8)).toBe(120);
		const pixel = (x: number, y: number): number => {
			const row = 119 - y; // bottom-left origin
			return tga[18 + (row * 320 + x) * 4]!; // blue channel
		};
		expect(pixel(0, 0)).toBe(0);
		expect(pixel(60, 60)).toBe(0);
		expect(pixel(205, 5)).toBe(0);
		expect(pixel(100, 5)).toBe(255);
		expect(pixel(319, 119)).toBe(255);

		// the PNG variants the web and the console views show
		const sizes = [painting.png, painting.big].map(png => ImageMagick.read(png, 'PNG', img => `${img.width}x${img.height}`));
		expect(sizes).toEqual(['320x120', '640x240']);
	});
});
