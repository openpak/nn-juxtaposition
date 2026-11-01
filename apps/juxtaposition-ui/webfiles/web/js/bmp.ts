/* Encodes a 1-bit black and white picture as a Windows BMP.
 *
 * This is the drawing format the OpenVerse server takes from the web: `painting` is the base64 of
 * this file and `bmp=true` tells the server to read it as a BMP (the same field a 3DS fills).
 * The server (miiverse-api images.ts, processBmpPainting) crops it to 320x120, makes it bilevel and
 * stores the zlib-compressed TGA that the Wii U and 3DS read, plus the PNGs the web shows.
 * So a web drawing is stored exactly like a console one. */

/** `ink[y * width + x]` is true for a black pixel. Rows run top to bottom. */
export function encodeBmp1(width: number, height: number, ink: ArrayLike<boolean | number>): Uint8Array {
	const rowBytes = Math.ceil(width / 8);
	const stride = Math.ceil(rowBytes / 4) * 4;
	const pixelBytes = stride * height;
	const headerBytes = 14 + 40 + 8; // file header, info header, 2-entry palette
	const out = new Uint8Array(headerBytes + pixelBytes);
	const view = new DataView(out.buffer);

	out[0] = 0x42; // 'B'
	out[1] = 0x4d; // 'M'
	view.setUint32(2, out.length, true);
	view.setUint32(10, headerBytes, true); // offset of the pixels
	view.setUint32(14, 40, true); // BITMAPINFOHEADER
	view.setInt32(18, width, true);
	view.setInt32(22, height, true); // positive: rows are stored bottom to top
	view.setUint16(26, 1, true); // planes
	view.setUint16(28, 1, true); // bits per pixel
	view.setUint32(30, 0, true); // no compression
	view.setUint32(34, pixelBytes, true);
	view.setInt32(38, 2835, true); // 72 dpi
	view.setInt32(42, 2835, true);
	view.setUint32(46, 2, true); // colours in the palette
	// palette (B, G, R, 0): index 0 = black, index 1 = white
	out.set([0, 0, 0, 0, 255, 255, 255, 0], 54);

	for (let y = 0; y < height; y++) {
		const rowStart = headerBytes + (height - 1 - y) * stride;
		for (let x = 0; x < width; x++) {
			if (!ink[y * width + x]) {
				out[rowStart + (x >> 3)]! |= 0x80 >> (x & 7); // white
			}
		}
	}
	return out;
}

export function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(s);
}
