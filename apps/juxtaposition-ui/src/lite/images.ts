import { config } from '@/config';

/** A drawing URL on the CDN becomes a path on this host. */
export function localImage(url: string | undefined | null): string | null {
	const prefix = config.cdnDomain.replace(/\/$/, '') + '/';
	if (!url || !url.startsWith(prefix)) {
		return null;
	}
	const rest = url.slice(prefix.length);
	return /^paintings\/[\w.-]+\/[\w.-]+\.png$/.test(rest) ? `/img/${rest}` : null;
}
