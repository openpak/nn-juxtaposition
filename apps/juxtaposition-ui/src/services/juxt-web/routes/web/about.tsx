import express from 'express';
import { WebAboutView } from '@/services/juxt-web/views/web/aboutView';

export const aboutRouter = express.Router();

aboutRouter.get('/', (_req, res) => {
	return res.jsx(<WebAboutView />);
});
