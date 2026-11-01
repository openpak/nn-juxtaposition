import { randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { redisClient } from '@/redis';
import { wrapApi } from '@/api/errors';
import { WebDevicesView } from '@/services/juxt-web/views/web/devicesView';
import { approveCode, normalizeCode, peekCode } from '@/lite/linkCodes';
import type { Request, Response } from 'express';
import type { KV } from '@/lite/linkCodes';
import type { DevicesViewProps } from '@/services/juxt-web/views/web/devicesView';

/* Approving a link code: the person is signed in through openpak.org (HTTPS), types the code a
 * console shows, sees what is asking, and confirms. Also lists and removes linked devices.
 * Every form carries a per-session token so another site cannot approve a code for them. */

export const devicesRouter = express.Router();

export const redisKv: KV = {
	get: async key => (await redisClient.get(key)) as string | null,
	set: (key, value, options) => redisClient.set(key, value, options),
	getDel: async key => (await redisClient.getDel(key)) as string | null
};

const LABELS: Record<string, string> = { ps3: 'PlayStation 3', wii: 'Wii', dsi: 'Nintendo DSi', x360: 'Xbox 360', lite: 'browser' };
const MAX_ACTIVE = 12;

const tryLimit = rateLimit({
	windowMs: 60 * 1000,
	limit: 10,
	standardHeaders: false,
	legacyHeaders: false,
	handler: (_req, res) => {
		res.redirect(303, '/devices?n=slow');
	}
});

function csrf(req: Request): string {
	req.session.devicesCsrf ??= randomBytes(16).toString('hex');
	return req.session.devicesCsrf;
}

function csrfOk(req: Request): boolean {
	const want = req.session.devicesCsrf;
	const got = req.body?.k;
	if (!want || typeof got !== 'string' || got.length !== want.length) {
		return false;
	}
	return timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

async function list(req: Request): Promise<DevicesViewProps['devices']> {
	const accountId = req.session.sso!.accountId;
	const { data } = await req.api.deviceLinks.list({ accountId });
	return data.items.map(d => ({
		id: d.id,
		deviceClass: d.deviceClass,
		label: d.label,
		createdAt: String(d.createdAt),
		lastUsedAt: d.lastUsedAt ? String(d.lastUsedAt) : null
	}));
}

function signedIn(req: Request, res: Response): boolean {
	if (!req.session.sso) {
		res.redirect('/login?redirect=%2Fdevices');
		return false;
	}
	return true;
}

const NOTES = ['approved', 'removed', 'bad', 'toomany', 'slow'] as const;

devicesRouter.get('/', async (req, res) => {
	if (!signedIn(req, res)) {
		return;
	}
	const n = NOTES.find(v => v === req.query.n) ?? null;
	res.set('Cache-Control', 'no-store').jsx(<WebDevicesView csrf={csrf(req)} devices={await list(req)} note={n} confirm={null} />);
});

devicesRouter.post('/check', express.urlencoded({ extended: false }), tryLimit, async (req, res) => {
	if (!signedIn(req, res)) {
		return;
	}
	if (!csrfOk(req)) {
		return res.redirect(303, '/devices?n=bad');
	}
	const code = normalizeCode(req.body?.code);
	const entry = code ? await peekCode(redisKv, code) : null;
	if (!code || !entry || entry.accountId) {
		return res.redirect(303, '/devices?n=bad');
	}
	res.set('Cache-Control', 'no-store').jsx(
		<WebDevicesView csrf={csrf(req)} devices={await list(req)} note={null} confirm={{ code, deviceLabel: LABELS[entry.deviceClass] ?? 'device' }} />
	);
});

devicesRouter.post('/approve', express.urlencoded({ extended: false }), tryLimit, async (req, res) => {
	if (!signedIn(req, res)) {
		return;
	}
	const code = normalizeCode(req.body?.code);
	if (!csrfOk(req) || !code) {
		return res.redirect(303, '/devices?n=bad');
	}
	if ((await list(req)).length >= MAX_ACTIVE) {
		return res.redirect(303, '/devices?n=toomany');
	}
	const ok = await approveCode(redisKv, code, req.session.sso!.accountId);
	return res.redirect(303, ok ? '/devices?n=approved' : '/devices?n=bad');
});

devicesRouter.post('/revoke', express.urlencoded({ extended: false }), async (req, res) => {
	if (!signedIn(req, res)) {
		return;
	}
	if (!csrfOk(req) || typeof req.body?.id !== 'string') {
		return res.redirect(303, '/devices?n=bad');
	}
	const out = await wrapApi(req.api.deviceLinks.revoke({ accountId: req.session.sso!.accountId, id: req.body.id }));
	return res.redirect(303, out.error ? '/devices?n=bad' : '/devices?n=removed');
});
