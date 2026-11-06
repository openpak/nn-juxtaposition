// Needs a throwaway Postgres (JUXT_UI_TEST_DB_URL); skipped without one.
import { describe, expect, it, vi } from 'vitest';

const url = process.env.JUXT_UI_TEST_DB_URL;

vi.mock('@/config', () => ({ config: { db: { url: process.env.JUXT_UI_TEST_DB_URL } } }));
vi.mock('@/logger', () => ({ logger: { success: () => {}, info: () => {}, error: () => {} } }));

describe.skipIf(!url)('postgres sessions and link codes', () => {
	it('stores, expires, consumes and sweeps', async () => {
		const { connectDb, getPool, pgKv, PgSessionStore, sweepExpired } = await import('@/db');
		await connectDb();
		const pool = getPool();
		await pool.query('DELETE FROM ui_kv; DELETE FROM ui_sessions');

		await pgKv.set('a', '1', { EX: 60 });
		expect(await pgKv.get('a')).toBe('1');
		await pgKv.set('a', '2', { EX: 60 });
		expect(await pgKv.getDel('a')).toBe('2');
		expect(await pgKv.getDel('a')).toBeNull();
		await pgKv.set('old', 'x', { EX: 60 });
		await pool.query('UPDATE ui_kv SET expires_at = now() - interval \'1 second\'');
		expect(await pgKv.get('old')).toBeNull();
		expect(await pgKv.getDel('old')).toBeNull();

		const store = new PgSessionStore();
		const call = <T>(fn: (cb: (e?: unknown, v?: T) => void) => void): Promise<T | undefined> => new Promise((res, rej) => fn((e, v) => (e ? rej(e) : res(v))));
		const sess = { cookie: { originalMaxAge: null } } as never;
		await call(cb => store.set('s1', sess, cb));
		expect(await call(cb => store.get('s1', cb))).toBeTruthy();
		await pool.query('UPDATE ui_sessions SET expires_at = now() - interval \'1 second\'');
		expect(await call(cb => store.get('s1', cb))).toBeNull();
		expect(await sweepExpired()).toBeGreaterThanOrEqual(1);
		await call(cb => store.set('s2', sess, cb));
		await call(cb => store.destroy('s2', cb));
		expect(await call(cb => store.get('s2', cb))).toBeNull();
		await pool.end();
	});
});
