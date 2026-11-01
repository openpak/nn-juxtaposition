import '@/extend-zod';
import express from 'express';
import superRequest from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '@/config';
import { dispatchInternal } from '@/services/internal/server';
import { forwardPath, webBridgeRouter } from '@/services/web-bridge/bridge';

vi.mock('@/config', () => ({ config: { web: { key: '' } } }));
vi.mock('@/services/internal/server', () => ({ dispatchInternal: vi.fn() }));

const app = express();
app.use('/internal/v1/web', webBridgeRouter);
const KEY = 'web-test-key';

beforeEach(() => {
	vi.resetAllMocks();
	(config.web as { key: string }).key = KEY;
});

describe('web bridge: who may call', () => {
	it('answers 404 with no key configured', async () => {
		(config.web as { key: string }).key = '';
		const res = await superRequest(app).get('/internal/v1/web/api/v1/communities').set('x-internal-key', KEY);
		expect(res.status).toBe(404);
	});
	it('answers 404 through the public proxy', async () => {
		const res = await superRequest(app).get('/internal/v1/web/api/v1/communities').set('x-internal-key', KEY).set('x-forwarded-for', '203.0.113.9');
		expect(res.status).toBe(404);
	});
	it('answers 401 for a wrong key', async () => {
		expect((await superRequest(app).get('/internal/v1/web/api/v1/communities')).status).toBe(401);
		expect((await superRequest(app).get('/internal/v1/web/api/v1/communities').set('x-internal-key', 'x')).status).toBe(401);
	});
});

describe('web bridge: what it forwards', () => {
	it('passes the path, the trusted pid and the body, and nothing else', async () => {
		vi.mocked(dispatchInternal).mockResolvedValue({ status: 200, body: { ok: true } });
		const res = await superRequest(app).post('/internal/v1/web/api/v1/posts/abc/empathies?x=1')
			.set('x-internal-key', KEY).set('x-trusted-pid', '1800000001').set('x-service-token', 'steal').send({ action: 'add' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		expect(dispatchInternal).toHaveBeenCalledWith('POST', '/api/v1/posts/abc/empathies?x=1',
			{ 'content-type': 'application/json', 'x-trusted-pid': '1800000001' }, { action: 'add' });
	});
	it('refuses admin routes, other prefixes and a bad pid', async () => {
		const get = (p: string) => superRequest(app).get('/internal/v1/web' + p).set('x-internal-key', KEY);
		expect((await get('/api/v1/admin/users')).status).toBe(404);
		expect((await get('/internal/v1/official/account')).status).toBe(404);
		expect((await get('/api/v1/../x')).status).toBe(404);
		expect((await get('/api/v1/self').set('x-trusted-pid', 'abc')).status).toBe(400);
		expect(dispatchInternal).not.toHaveBeenCalled();
	});
	it('forwardPath only allows the api prefix', () => {
		expect(forwardPath('/api/v1/self')).toBe('/api/v1/self');
		expect(forwardPath('/api/v1/admin/stats')).toBeNull();
		expect(forwardPath('/x')).toBeNull();
	});
});
