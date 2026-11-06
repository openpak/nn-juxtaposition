import { Pool } from 'pg';
import session from 'express-session';
import { logger } from '@/logger';
import { config } from '@/config';
import type { KV } from '@/lite/linkCodes';

/* Postgres storage for what used to live in Redis (card openpak/prds#20): web sessions and the short
 * device link codes. Both are expiring data: every row has an expires_at, reads ignore expired rows,
 * and a sweep deletes them. Tables are created at start-up (additive, IF NOT EXISTS). */

let pool: Pool | null = null;

export function getPool(): Pool {
	if (!pool) {
		pool = new Pool({ connectionString: config.db.url, max: 5 });
		pool.on('error', error => logger.error(error));
	}
	return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ui_sessions (
	sid        text PRIMARY KEY,
	sess       jsonb NOT NULL,
	expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ui_sessions_expires ON ui_sessions (expires_at);
CREATE TABLE IF NOT EXISTS ui_kv (
	key        text PRIMARY KEY,
	value      text NOT NULL,
	expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ui_kv_expires ON ui_kv (expires_at);
`;

const SWEEP_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function sweepExpired(db: Pick<Pool, 'query'> = getPool()): Promise<number> {
	const a = await db.query('DELETE FROM ui_sessions WHERE expires_at < now()');
	const b = await db.query('DELETE FROM ui_kv WHERE expires_at < now()');
	return (a.rowCount ?? 0) + (b.rowCount ?? 0);
}

export async function connectDb(): Promise<void> {
	await getPool().query(SCHEMA);
	logger.success('Postgres connected');
	const timer = setInterval(() => {
		sweepExpired().then((n) => {
			if (n > 0) {
				logger.info(`Swept ${n} expired session/link rows`);
			}
		}).catch(error => logger.error(error, 'Expiry sweep failed'));
	}, SWEEP_MS);
	timer.unref();
}

/** express-session store. A session lives until its cookie expiry, or a day when the cookie has none. */
export class PgSessionStore extends session.Store {
	private ttlMs(sess: session.SessionData): number {
		const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() - Date.now() : DEFAULT_SESSION_TTL_MS;
		return Math.max(expires, 1000);
	}

	get(sid: string, cb: (err?: unknown, sess?: session.SessionData | null) => void): void {
		getPool().query('SELECT sess FROM ui_sessions WHERE sid = $1 AND expires_at > now()', [sid])
			.then(r => cb(null, r.rows[0]?.sess ?? null), cb);
	}

	set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
		getPool().query(
			`INSERT INTO ui_sessions (sid, sess, expires_at) VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)
			 ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expires_at = EXCLUDED.expires_at`,
			[sid, JSON.stringify(sess), String(Math.round(this.ttlMs(sess)))]
		).then(() => cb?.(), error => cb?.(error));
	}

	touch(sid: string, sess: session.SessionData, cb?: () => void): void {
		getPool().query('UPDATE ui_sessions SET expires_at = now() + ($2 || \' milliseconds\')::interval WHERE sid = $1', [sid, String(Math.round(this.ttlMs(sess)))])
			.then(() => cb?.(), () => cb?.());
	}

	destroy(sid: string, cb?: (err?: unknown) => void): void {
		getPool().query('DELETE FROM ui_sessions WHERE sid = $1', [sid]).then(() => cb?.(), error => cb?.(error));
	}
}

/** The KV the link codes use, on ui_kv. */
export const pgKv: KV = {
	async get(key) {
		const r = await getPool().query('SELECT value FROM ui_kv WHERE key = $1 AND expires_at > now()', [key]);
		return (r.rows[0]?.value as string | undefined) ?? null;
	},
	set(key, value, options) {
		return getPool().query(
			`INSERT INTO ui_kv (key, value, expires_at) VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
			 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
			[key, value, String(options.EX)]
		);
	},
	async getDel(key) {
		const r = await getPool().query('DELETE FROM ui_kv WHERE key = $1 RETURNING value, expires_at > now() AS live', [key]);
		return r.rows[0]?.live ? (r.rows[0].value as string) : null;
	}
};
