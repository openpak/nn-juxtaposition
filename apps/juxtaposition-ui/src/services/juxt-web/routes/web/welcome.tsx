import express from 'express';
import { z } from 'zod';
import { safeRedirect } from '@/sso';
import { parseReq } from '@/services/juxt-web/routes/routeUtils';
import { WebWelcomeView } from '@/services/juxt-web/views/web/welcomeView';

export const welcomeRouter = express.Router();

welcomeRouter.get('/', (req, res) => {
	const { query } = parseReq(req, {
		query: z.object({ redirect: z.string().optional() })
	});
	if (req.self?.hasAcceptedRules !== false) {
		return res.redirect(safeRedirect(query.redirect) === '/' ? '/titles' : safeRedirect(query.redirect));
	}
	return res.jsx(<WebWelcomeView redirect={safeRedirect(query.redirect)} />);
});

welcomeRouter.post('/accept', express.urlencoded({ extended: false }), async (req, res) => {
	if (!req.self) {
		return res.redirect('/login');
	}
	await req.api.sso.acceptRules();
	const target = safeRedirect(typeof req.body?.redirect === 'string' ? req.body.redirect : undefined);
	return res.redirect(target === '/' ? '/titles' : target);
});
