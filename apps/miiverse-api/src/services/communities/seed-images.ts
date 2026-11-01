/* Flat community artwork for the seeded communities: a coloured rounded square (icon) or band
 * (header) with a big white letter. Drawn with plain arithmetic and written as PNG with node's zlib,
 * so seeding needs no image tooling and the same input always gives the same bytes. The server's
 * own icon and header pipeline (images.ts) then resizes and converts them like any uploaded art. */

import { deflateSync } from 'node:zlib';

// 5x7 capitals, one string per row, '#' = on. Only the letters the seeds use.
const FONT: Record<string, string[]> = {
	A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
	D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
	F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
	H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
	I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
	M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
	O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
	S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
	W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#']
};

export type Rgb = [number, number, number];

export function hexColor(hex: string): Rgb {
	const n = parseInt(hex.replace('#', ''), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (const b of buf) {
		c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0; // filter: none
		Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
	return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

function setPixel(px: Uint8Array, i: number, c: Rgb): void {
	px.set([c[0], c[1], c[2], 255], i);
}

function glyphOn(letter: string, gx: number, gy: number): boolean {
	const rows = FONT[letter.toUpperCase()];
	return !!rows && gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && rows[gy]![gx] === '#';
}

/** A letter drawn at `cell` pixels per font pixel with its top left at (x0, y0). */
function drawLetter(px: Uint8Array, width: number, letter: string, x0: number, y0: number, cell: number, color: Rgb): void {
	for (let gy = 0; gy < 7; gy++) {
		for (let gx = 0; gx < 5; gx++) {
			if (!glyphOn(letter, gx, gy)) {
				continue;
			}
			for (let dy = 0; dy < cell; dy++) {
				for (let dx = 0; dx < cell; dx++) {
					const i = ((y0 + gy * cell + dy) * width + (x0 + gx * cell + dx)) * 4;
					setPixel(px, i, color);
				}
			}
		}
	}
}

/** Square icon: rounded square in `color`, a slightly lighter lower half, one white letter. */
export function renderIcon(letter: string, color: Rgb, size = 256): Buffer {
	const px = new Uint8Array(size * size * 4);
	const radius = size * 0.2;
	const light = mix(color, [255, 255, 255], 0.18);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			// distance outside the rounded square (corner circles)
			const cx = Math.min(Math.max(x, radius), size - 1 - radius);
			const cy = Math.min(Math.max(y, radius), size - 1 - radius);
			const inside = Math.hypot(x - cx, y - cy) <= radius;
			const i = (y * size + x) * 4;
			if (!inside) {
				continue; // transparent corner
			}
			const c = y > size * 0.62 ? light : color;
			setPixel(px, i, c);
		}
	}
	const cell = Math.floor(size / 12);
	drawLetter(px, size, letter, Math.floor((size - 5 * cell) / 2), Math.floor((size - 7 * cell) / 2), cell, [255, 255, 255]);
	return encodePng(size, size, px);
}

/** Wide banner: `color` fading to a lighter edge, the letter at the left. */
export function renderBanner(letter: string, color: Rgb, width: number, height: number): Buffer {
	const px = new Uint8Array(width * height * 4);
	const light = mix(color, [255, 255, 255], 0.22);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const c = mix(color, light, x / (width - 1));
			const i = (y * width + x) * 4;
			setPixel(px, i, c);
		}
	}
	const cell = Math.max(2, Math.floor(height / 12));
	drawLetter(px, width, letter, Math.floor(height * 0.5), Math.floor((height - 7 * cell) / 2), cell, [255, 255, 255]);
	return encodePng(width, height, px);
}

/** The default avatar for people with no Mii: a head and shoulders on an indigo disc. */
export function renderAvatar(size = 256): Buffer {
	const px = new Uint8Array(size * size * 4);
	const bg: Rgb = [79, 70, 229];
	const fg: Rgb = [238, 241, 255];
	const r = size / 2;
	const headR = size * 0.2;
	const headY = size * 0.4;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dx = x + 0.5 - r;
			const dy = y + 0.5 - r;
			if (Math.hypot(dx, dy) > r) {
				continue; // outside the disc: transparent
			}
			const head = Math.hypot(dx, y + 0.5 - headY) <= headR;
			// shoulders: the top of a wide ellipse centred below the disc's middle
			const sx = dx / (size * 0.36);
			const sy = (y + 0.5 - size * 0.92) / (size * 0.34);
			const shoulders = sx * sx + sy * sy <= 1;
			const c = head || shoulders ? fg : bg;
			const i = (y * size + x) * 4;
			setPixel(px, i, c);
		}
	}
	return encodePng(size, size, px);
}
