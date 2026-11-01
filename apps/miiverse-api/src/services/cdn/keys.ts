// Which object keys the public media route will serve. The Miiverse bucket
// also holds nothing private today, but the route is a plain read-through to
// object storage, so it only answers for the prefixes the API itself writes
// and refuses anything that could climb out of them.
export const CDN_PREFIXES = ['paintings/', 'screenshots/', 'icons/', 'headers/', 'mii/'] as const;

/** Returns the bucket key for a request path, or null when it must not be served. */
export function toCdnKey(path: string): string | null {
	let key: string;
	try {
		key = decodeURIComponent(path);
	} catch {
		return null;
	}
	key = key.replace(/^\/+/, '');

	if (key.length === 0 || key.length > 256 || key.includes('\0') || key.includes('\\')) {
		return null;
	}
	if (key.split('/').some(part => part === '' || part === '.' || part === '..')) {
		return null;
	}
	if (!CDN_PREFIXES.some(prefix => key.startsWith(prefix))) {
		return null;
	}
	return key;
}

export function contentTypeFor(key: string): string {
	const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
	switch (ext) {
		case 'png': return 'image/png';
		case 'jpg':
		case 'jpeg': return 'image/jpeg';
		case 'tga': return 'image/x-tga';
		default: return 'application/octet-stream';
	}
}

/**
 * Post media can be deleted at any time and must then stop loading, so it is never cached
 * without revalidation. Community icons, headers and Mii faces are static.
 */
export function cacheControlFor(key: string): string {
	return key.startsWith('screenshots/') || key.startsWith('paintings/') ? 'no-cache' : 'public, max-age=86400';
}
