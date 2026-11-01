import express from 'express';
import { z } from 'zod';
import { config } from '@/config';
import { parseReq } from '@/services/juxt-web/routes/routeUtils';
import { WebActivityList, WebActivityPage, WebActivitySettingsPage } from '@/services/juxt-web/views/web/activityView';

/** Game activity: the opt-in automatic posts (a badge earned, a course uploaded...). Web only. */
export const activityRouter = express.Router();

activityRouter.get('/', async (req, res) => {
	const { query, hasAuth } = parseReq(req, {
		query: z.object({
			scope: z.enum(['everyone', 'following']).optional().default('everyone'),
			pjax: z.stringbool().optional(),
			offset: z.coerce.number().optional().default(0)
		})
	});
	if (!hasAuth()) {
		return res.redirect('/login');
	}
	const { data } = await req.api.activity.list({ scope: query.scope, limit: config.postLimit, offset: query.offset });
	const hasMore = data.items.length >= config.postLimit;
	const next = `/activity?scope=${query.scope}&offset=${query.offset + data.items.length}`;
	const props = {
		items: data.items,
		hasMore,
		back: query.scope === 'following' ? '/activity?scope=following' : '/activity',
		nextLink: next + '&pjax=true',
		prevPageLink: query.offset > 0 ? `/activity?scope=${query.scope}&offset=${Math.max(query.offset - data.items.length, 0)}` : null,
		nextPageLink: next
	};
	if (query.pjax) {
		return res.jsx(<WebActivityList {...props} fragment />);
	}
	return res.jsx(<WebActivityPage {...props} scope={query.scope} />);
});

activityRouter.get('/settings', async (req, res) => {
	const { query, auth, hasAuth } = parseReq(req, {
		query: z.object({ saved: z.string().optional() })
	});
	if (!hasAuth()) {
		return res.redirect('/login');
	}
	const { data: settings } = await req.api.activity.settings.get();
	if (!settings) {
		return res.redirect('/404');
	}
	return res.jsx(<WebActivitySettingsPage settings={settings} readOnly={auth().self.readOnly === true} saved={query.saved === '1'} />);
});

activityRouter.post('/settings', express.urlencoded({ extended: false }), async (req, res) => {
	const { auth, hasAuth } = parseReq(req);
	if (!hasAuth()) {
		return res.redirect('/login');
	}
	if (auth().self.readOnly === true) {
		return res.redirect('/activity/settings');
	}
	const raw = req.body?.category;
	const categories = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((v): v is string => typeof v === 'string');
	await req.api.activity.settings.update({ enabled: req.body?.enabled === '1', categories });
	return res.redirect('/activity/settings?saved=1');
});

// Remove one of your own activity posts, then go back to the page it was on.
activityRouter.post('/:id/delete', express.urlencoded({ extended: false }), async (req, res) => {
	const { params, hasAuth } = parseReq(req, { params: z.object({ id: z.coerce.number().int() }) });
	if (!hasAuth()) {
		return res.redirect('/login');
	}
	await req.api.activity.delete({ id: params.id });
	const back = typeof req.body?.back === 'string' && /^\/(activity|users\/(me|\d+)\/activity)(\?[\w=&]*)?$/.test(req.body.back) ? req.body.back : '/activity';
	return res.redirect(back);
});
