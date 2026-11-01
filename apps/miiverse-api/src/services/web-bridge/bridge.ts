/* The web bridge: a private HTTP door to the internal API for the OpenVerse web app (common/openverse).
 *
 * The internal API (services/internal) is otherwise reachable only over gRPC (`sendPacket`). The Go web
 * app has no gRPC client, so this router forwards one request at a time to the same app, with the same
 * contract (internal.openapi.json), under the same rules as the gRPC door:
 *
 *   ANY /internal/v1/web/api/v1/...  ->  /api/v1/...
 *
 * - X-Internal-Key must be PN_MIIVERSE_API_WEB_KEY. With no key configured, or when the request carries
 *   X-Forwarded-For (it came through the public proxy), the answer is 404, like the other private routes.
 * - X-Trusted-Pid names the person the web app has already signed in (the pid the `sso.resolve` call
 *   returned); it is passed on as the `x-trusted-pid` header the UI uses. No header = a guest.
 * - Only /api/v1/ paths, never /api/v1/admin/ (moderation stays in the Juxtaposition UI for now).
 * - No other header is forwarded, so a caller cannot send a service token or an OAuth token this way. */

import express from 'express';
import { config } from '@/config';
import { keyMatches } from '@/services/official/helpers';
import { dispatchInternal } from '@/services/internal/server';

export const webBridgeRouter = express.Router();
webBridgeRouter.use(express.json({ limit: '10mb' }));

const PREFIX = '/api/v1/';

/** The path to forward, or null when the bridge must refuse it. */
export function forwardPath(url: string): string | null {
	if (!url.startsWith(PREFIX) || url.includes('..') || url.includes('\\') || /[\r\n]/.test(url)) {
		return null;
	}
	if (url.startsWith(PREFIX + 'admin/') || url.startsWith(PREFIX + 'admin?')) {
		return null;
	}
	return url;
}

webBridgeRouter.use(async (req, res) => {
	if (config.web.key === '' || req.get('x-forwarded-for') !== undefined) {
		return res.status(404).json({ error: 'not found' });
	}
	if (!keyMatches(req.get('x-internal-key'), config.web.key)) {
		return res.status(401).json({ error: 'key required' });
	}
	const path = forwardPath(req.url);
	if (!path) {
		return res.status(404).json({ error: 'not found' });
	}
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	const pid = req.get('x-trusted-pid');
	if (pid !== undefined) {
		if (!/^[0-9]{1,10}$/.test(pid)) {
			return res.status(400).json({ error: 'bad x-trusted-pid' });
		}
		headers['x-trusted-pid'] = pid;
	}
	try {
		const out = await dispatchInternal(req.method, path, headers, req.body);
		return res.status(out.status).json(out.body);
	} catch (e) {
		req.log.error(e, 'web bridge request failed');
		return res.status(502).json({ error: 'bridge failed' });
	}
});
