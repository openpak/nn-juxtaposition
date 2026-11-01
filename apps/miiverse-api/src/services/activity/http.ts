import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { config } from '@/config';
import { getDb } from '@/database';
import { getWebAccess } from '@/services/web-identity/access';
import { ingestActivity, liveCategories } from '@/services/activity/activity';

/**
 * POST /internal/v1/activity: a server (rewards, a game server) reports a moment for an account.
 * X-Internal-Key = PN_MIIVERSE_API_ACTIVITY_KEY. Private network only; the endpoint is not routed
 * publicly. Idempotent by event_id. See docs/activity.md.
 */
export const activityIngestRouter = express.Router();

const bodySchema = z.object({
	event_id: z.string().min(1).max(160),
	account_id: z.string().min(1).max(64),
	category: z.string().min(1).max(32),
	subject: z.string().max(200).optional(),
	link: z.string().max(400).optional(),
	image: z.string().max(400).optional(),
	occurred_at: z.string().datetime().optional()
});

function keyOk(got: string | undefined, want: string): boolean {
	if (!got || want === '') {
		return false;
	}
	const a = Buffer.from(got);
	const b = Buffer.from(want);
	return a.length === b.length && timingSafeEqual(a, b);
}

activityIngestRouter.post('/internal/v1/activity', async (req, res, next) => {
	try {
		// api.olv.openpak.org is routed publicly by Traefik, which adds X-Forwarded-For. Callers on the
		// private network (rewards, game servers) connect directly and carry none: those only.
		if (config.activity.key === '' || req.get('x-forwarded-for') !== undefined) {
			return res.status(404).json({ error: 'not found' });
		}
		if (!keyOk(req.get('x-internal-key'), config.activity.key)) {
			return res.status(401).json({ error: 'key required' });
		}
		const parsed = bodySchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ error: 'invalid request', detail: parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; ') });
		}
		const b = parsed.data;
		const result = await ingestActivity(getDb() as never, {
			eventId: b.event_id,
			accountId: b.account_id,
			category: b.category,
			subject: b.subject,
			link: b.link,
			image: b.image,
			occurredAt: b.occurred_at ? new Date(b.occurred_at) : null
		}, {
			live: liveCategories(config.activity.categories),
			imageHosts: config.activity.imageHosts,
			isReadOnly: async accountId => (await getWebAccess(accountId)) !== 'full'
		});
		if (result.status === 'rejected') {
			return res.status(400).json({ event_id: b.event_id, status: result.status, error: result.error });
		}
		return res.status(200).json({ event_id: b.event_id, status: result.status });
	} catch (e) {
		return next(e);
	}
});
