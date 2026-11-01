import { Readable } from 'node:stream';
import express from 'express';

/* Pictures for the web UI. The API serves them at https://api.olv.openpak.org/cdn, a name only a
 * console's DNS resolves, so a browser could not load a single icon, drawing or Mii. The web UI
 * links to https://verse.openpak.org/cdn/... instead and this route reads them from the API over
 * the private network. Read-only; the API only answers for its own media prefixes. */

const API = process.env.PN_JUXTAPOSITION_UI_API_HTTP_URL ?? 'http://openpak-nn-juxtaposition-api:20090';
const PREFIXES = ['paintings/', 'screenshots/', 'icons/', 'headers/', 'mii/'];

export const cdnProxy = express.Router();

cdnProxy.get(/^\/cdn\/(.+)$/, async (req, res) => {
	const key = String((req.params as unknown as string[])[0]);
	if (!PREFIXES.some(p => key.startsWith(p)) || key.includes('..') || key.includes('\\')) {
		return res.sendStatus(404);
	}
	try {
		const upstream = await fetch(`${API}/cdn/${key.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(8000) });
		if (!upstream.ok || !upstream.body) {
			return res.sendStatus(upstream.status === 404 ? 404 : 502);
		}
		res.status(200);
		res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
		res.setHeader('Cache-Control', 'public, max-age=86400');
		Readable.fromWeb(upstream.body as never).pipe(res);
	} catch {
		res.sendStatus(502);
	}
});
