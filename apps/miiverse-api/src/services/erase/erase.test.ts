import '@/extend-zod'; // Needs to be the first import
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { eraseAccount } from '@/services/erase/erase';
import { eraseRouter } from '@/services/erase/http';
import type { EraseStore } from '@/services/erase/erase';

vi.hoisted(() => {
	process.env.SKIP_CONFIG_VALIDATION = 'true';
});

const ACCOUNT = '11111111-2222-3333-4444-555555555555';

function fakeStore(): EraseStore & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		pidsOf: async () => [1800000005, 1700000001],
		eraseMongo: async (pids) => {
			calls.push(`mongo ${pids.join(',')}`);
			return 3;
		},
		erasePostgres: async (account, pids) => {
			calls.push(`pg ${account} ${pids.join(',')}`);
			return 4;
		}
	};
}

describe('eraseAccount', () => {
	it('erases Mongo by pid, then Postgres (which drops the web identity), and sums the rows', async () => {
		const store = fakeStore();
		expect(await eraseAccount(ACCOUNT, store)).toBe(7);
		expect(store.calls).toEqual(['mongo 1800000005,1700000001', `pg ${ACCOUNT} 1800000005,1700000001`]);
	});

	it('still clears the account-keyed Postgres rows when it has no pid', async () => {
		const store = fakeStore();
		store.pidsOf = async () => [];
		expect(await eraseAccount(ACCOUNT, store)).toBe(4);
		expect(store.calls).toEqual([`pg ${ACCOUNT} `]);
	});

	it('fails (so it is retried) when the pids cannot be found out', async () => {
		const store = fakeStore();
		store.pidsOf = async () => {
			throw new Error('nn-account down');
		};
		await expect(eraseAccount(ACCOUNT, store)).rejects.toThrow();
		expect(store.calls).toEqual([]);
	});
});

describe('DELETE /internal/accounts/:id/data', () => {
	const app = (key: string, store = fakeStore()): express.Express => express().use(eraseRouter(() => key, store));
	const path = `/internal/accounts/${ACCOUNT}/data`;

	it('is 503 with no key configured', async () => {
		expect((await supertest(app('')).delete(path).set('Authorization', 'Bearer x')).status).toBe(503);
	});
	it('rejects a missing or wrong key', async () => {
		const store = fakeStore();
		expect((await supertest(app('k', store)).delete(path)).status).toBe(401);
		expect((await supertest(app('k', store)).delete(path).set('Authorization', 'Bearer nope')).status).toBe(401);
		expect(store.calls).toEqual([]);
	});
	it('is 404 through the public proxy', async () => {
		expect((await supertest(app('k')).delete(path).set('Authorization', 'Bearer k').set('X-Forwarded-For', '1.2.3.4')).status).toBe(404);
	});
	it('rejects a non-UUID account id', async () => {
		expect((await supertest(app('k')).delete('/internal/accounts/abc/data').set('Authorization', 'Bearer k')).status).toBe(400);
	});
	it('answers {service, rows}', async () => {
		const res = await supertest(app('k')).delete(path).set('Authorization', 'Bearer k');
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ service: 'nn-juxtaposition', rows: 7 });
	});
});
