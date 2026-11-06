import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearIdentityCache, FALLBACK_NAME, miiFaceUrl, resolveIdentities } from '@/services/identity/identity';
import { OFFICIAL_NAME, OFFICIAL_PID } from '@/services/web-identity/web-identity';
import type { IdentitySource } from '@/services/identity/identity';

vi.mock('@/config', () => ({ config: { cdnUrl: 'https://cdn.test' } }));
const warn = vi.fn();
vi.mock('@/logger', () => ({ logger: { info: () => undefined, warn: (...a: unknown[]) => warn(...a), error: () => undefined } }));
vi.mock('@/database', () => ({ getDb: () => ({}) }));
vi.mock('@/util', () => ({ getUserAccountData: async () => ({}) }));

const CONSOLE = 1700000001;
const BROKEN = 1700000002;
const WEB = 1800000001;

function source(): IdentitySource & { calls: number[] } {
	const calls: number[] = [];
	return {
		calls,
		async console(pid) {
			calls.push(pid);
			if (pid === BROKEN) {
				throw new Error('core down');
			}
			return { name: `Core ${pid}`, miiData: 'MII' };
		},
		async displayNames(pids) {
			return new Map(pids.filter(p => p !== CONSOLE).map(p => [p, `Cached ${p}`]));
		}
	};
}

beforeEach(() => {
	clearIdentityCache();
	warn.mockReset();
});

describe('post author identity', () => {
	it('reads console players from the core, web-only players from the cached core name, Pakka fixed', async () => {
		const src = source();
		const ids = await resolveIdentities([CONSOLE, CONSOLE, WEB, OFFICIAL_PID], src);
		expect(ids.get(CONSOLE)).toEqual({ pid: CONSOLE, name: `Core ${CONSOLE}`, miiData: 'MII' });
		expect(ids.get(WEB)).toEqual({ pid: WEB, name: `Cached ${WEB}`, miiData: '' });
		expect(ids.get(OFFICIAL_PID)).toEqual({ pid: OFFICIAL_PID, name: OFFICIAL_NAME, miiData: '' });
		expect(src.calls).toEqual([CONSOLE]); // one lookup per pid, web-only never asks the core
	});

	it('serves a fallback when the core fails, logs it, and asks again next time', async () => {
		const src = source();
		const ids = await resolveIdentities([BROKEN, CONSOLE], src);
		expect(ids.get(BROKEN)).toEqual({ pid: BROKEN, name: `Cached ${BROKEN}`, miiData: '' });
		expect(ids.get(CONSOLE)?.miiData).toBe('MII');
		expect(warn).toHaveBeenCalledTimes(1);
		await resolveIdentities([BROKEN, CONSOLE], src);
		expect(src.calls.filter(p => p === BROKEN)).toHaveLength(2); // failures are not cached
		expect(src.calls.filter(p => p === CONSOLE)).toHaveLength(1); // answers are
	});

	it('keeps the full cached core name when nn-account hands out its ten character form', async () => {
		const src: IdentitySource = {
			console: async () => ({ name: 'Christophe', miiData: 'MII' }),
			displayNames: async () => new Map([[CONSOLE, 'Christopher Long'], [BROKEN, 'Somebody Else']])
		};
		const ids = await resolveIdentities([CONSOLE, BROKEN], src);
		expect(ids.get(CONSOLE)?.name).toBe('Christopher Long');
		expect(ids.get(BROKEN)?.name).toBe('Christophe'); // the cache is stale: the core wins
	});

	it('uses the generic name when nothing knows the player', async () => {
		const ids = await resolveIdentities([1800000099], { console: async () => ({ name: '', miiData: '' }), displayNames: async () => new Map() });
		expect(ids.get(1800000099)?.name).toBe(FALLBACK_NAME);
	});

	it('derives the face image from pid and feeling', () => {
		expect(miiFaceUrl(CONSOLE, 4)).toBe(`https://cdn.test/mii/${CONSOLE}/frustrated.png`);
		expect(miiFaceUrl(CONSOLE, null)).toBe(`https://cdn.test/mii/${CONSOLE}/normal_face.png`);
		expect(miiFaceUrl(WEB, 9)).toBe('https://cdn.test/mii/default/normal_face.png');
		expect(miiFaceUrl(OFFICIAL_PID, 0)).toBe(`https://cdn.test/mii/${OFFICIAL_PID}/normal_face.png`);
	});
});
