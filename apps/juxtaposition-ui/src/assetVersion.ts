import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Bundled into dist/server.js, so this is the dist folder (same as util.distFolder); config-free so views can import it in tests.
const distFolder = path.dirname(fileURLToPath(import.meta.url));

const cache = new Map<string, string>();

/** `?v=` value for a file under webfiles/, so a changed stylesheet is never served from a stale CDN or browser cache. */
export function assetVersion(file: string): string {
	let v = cache.get(file);
	if (v === undefined) {
		try {
			v = createHash('sha256').update(readFileSync(path.join(distFolder, 'webfiles', file))).digest('hex').slice(0, 10);
		} catch {
			v = '0';
		}
		cache.set(file, v);
	}
	return v;
}
