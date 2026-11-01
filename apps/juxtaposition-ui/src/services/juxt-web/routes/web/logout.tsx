import express from 'express';
import { config } from '@/config';

export const logoutRouter = express.Router();

logoutRouter.get('/', (req, res) => {
	const done = new URL('/login', config.http.baseUrl);
	const target = new URL(config.sso.logoutUrl);
	target.searchParams.set('redirect_uri', done.toString());
	req.session.destroy(() => {
		res.clearCookie('connect.sid');
		res.redirect(target.toString());
	});
});
