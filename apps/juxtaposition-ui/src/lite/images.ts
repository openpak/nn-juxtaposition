/** A drawing URL from the API (https://<host>/cdn/paintings/<pid>/<id>.png, whichever host it names) becomes a path on this host. */
export function localImage(url: string | undefined | null): string | null {
	const m = /^https?:\/\/[^/]+\/cdn\/(paintings\/[\w.-]+\/[\w.-]+\.png)$/.exec(url ?? '');
	return m ? `/img/${m[1]}` : null;
}
