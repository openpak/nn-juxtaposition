import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({ config: { log: { sensitive: false, level: 'info', format: 'json' } } }));
vi.mock('@/logger', async () => ({ logger: (await import('pino')).pino({ level: 'silent' }) }));
vi.mock('@/util', () => ({ decodeParamPack: (): object => ({ pid: 'DEVICE-ID' }) }));

describe('serializeReq', () => {
	it('keeps method and path only, never the query, headers or param pack', async () => {
		const { serializeReq } = await import('@/loggerHttp');
		const out = JSON.stringify(serializeReq({
			id: 1,
			method: 'GET',
			url: '/titles/1?token=SEKRET#frag',
			headers: { 'authorization': 'Bearer SEKRET', 'cookie': 'c=SEKRET', 'referer': 'http://x/?t=SEKRET', 'user-agent': 'UA' },
			query: { token: 'SEKRET' },
			remoteAddress: '10.0.0.1',
			remotePort: 1,
			raw: { ip: '10.0.0.1', headers: { 'x-nintendo-parampack': 'AAAA' } }
		} as never));
		expect(out).toContain('/titles/1');
		expect(out).not.toMatch(/SEKRET|DEVICE-ID|Bearer|user-agent|parampack|param_pack|frag/i);
	});
});
