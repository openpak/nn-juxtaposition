import express from 'express';

export const logoutRouter = express.Router();

// Sign out of this site only: openpak.org stays signed in (like leaving one Google app).
// /about is the signed-out landing page; /login would send the browser straight back to openpak.org.
logoutRouter.get('/', (req, res) => {
	res.set('Cache-Control', 'no-store');
	req.session.destroy(() => {
		res.clearCookie('connect.sid');
		res.redirect(303, '/about');
	});
});
