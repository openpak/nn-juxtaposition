import express from 'express';
import { keyMatches } from '@/services/official/helpers';
import { eraseAccount, SERVICE } from '@/services/erase/erase';
import type { EraseStore } from '@/services/erase/erase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /internal/accounts/:account_id/data, Authorization: Bearer <ACCOUNT_ERASE_KEY>.
 * Private network only: 404 through the public proxy (X-Forwarded-For), 503 with no key set.
 */
export function eraseRouter(key: () => string = () => process.env.ACCOUNT_ERASE_KEY ?? '', store?: EraseStore): express.Router {
	const router = express.Router();
	router.delete('/internal/accounts/:account_id/data', async (req, res, next) => {
		try {
			if (req.get('x-forwarded-for') !== undefined) {
				return res.status(404).json({ error: 'not found' });
			}
			if (key() === '') {
				return res.status(503).json({ error: 'erasure not configured' });
			}
			const given = (req.get('authorization') ?? '').replace(/^Bearer /, '');
			if (!(req.get('authorization') ?? '').startsWith('Bearer ') || !keyMatches(given, key())) {
				return res.status(401).json({ error: 'unauthorized' });
			}
			const id = req.params.account_id ?? '';
			if (!UUID.test(id)) {
				return res.status(400).json({ error: 'account_id must be a UUID' });
			}
			const rows = await eraseAccount(id.toLowerCase(), store);
			return res.status(200).json({ service: SERVICE, rows });
		} catch (e) {
			return next(e);
		}
	});
	return router;
}
