// One-shot import of the Miiverse Mongo data into Postgres (card openpak/prds#20). Idempotent: every
// imported row carries its ObjectId in legacy_mongo_id (unique), a second run inserts nothing.
//
//   1. Export each collection of the `miiverse` db as extended-JSON lines (one file per collection):
//        mongosh miiverse --quiet --eval 'db.posts.find().sort({_id:1}).forEach(d => print(EJSON.stringify(d)))' > posts.ndjson
//      likewise communities, endpoints, conversations, reports, automodrules, automodlogs, logs.
//   2. Apply the schema first: `npm run migration:deploy` in apps/miiverse-api.
//   3. node script.cjs --check <dir>     every post author must resolve in the account core (below)
//      node script.cjs <dir>             import; refuses while an author does not resolve, unless
//                                        --allow-unresolved is given (those posts then show the
//                                        generic name and no Mii)
//
// Environment: PN_MIIVERSE_API_DB_URL (Postgres), and for the author check PN_MIIVERSE_API_OPENPAK_NNAS_URL /
// PN_MIIVERSE_API_OPENPAK_NNAS_KEY (nn-account's internal resolver, the same settings the API uses). Neither
// value is ever printed.
//
// Posts no longer store the author's name or Mii (screen_name, mii, mii_face_url): the API reads them from
// the account core when it serves a post. The import leaves those three fields out and says how many it
// left out; Mongo itself stays untouched (read-only) as the copy of record until it is retired.
//
// Prints the Mongo line count and the Postgres row count per table before and after; exits 1 when an
// imported table has fewer rows with a legacy_mongo_id than the file has lines, 3 when the author check
// fails, 2 on usage or connection errors.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const allowUnresolved = args.includes('--allow-unresolved');
const dir = args.find(a => !a.startsWith('--'));
if (!dir) {
	console.error('usage: script.cjs [--check] [--allow-unresolved] <dir with *.ndjson>');
	process.exit(2);
}

const OFFICIAL_PID = 2000000000;
const WEB_ONLY_PID_MIN = 1800000001;

// Extended JSON (relaxed or canonical) to plain values. Dates become Date objects.
function unwrap(v) {
	if (Array.isArray(v)) {
		return v.map(unwrap);
	}
	if (v && typeof v === 'object') {
		if ('$oid' in v) return v.$oid;
		if ('$date' in v) {
			const d = v.$date;
			return new Date(typeof d === 'object' ? Number(d.$numberLong) : d);
		}
		if ('$numberLong' in v) return Number(v.$numberLong);
		if ('$numberInt' in v) return Number(v.$numberInt);
		if ('$numberDouble' in v) return Number(v.$numberDouble);
		if ('$numberDecimal' in v) return Number(v.$numberDecimal);
		return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrap(x)]));
	}
	return v;
}

function read(name) {
	const file = path.join(dir, name + '.ndjson');
	if (!fs.existsSync(file)) {
		return [];
	}
	return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() !== '').map(l => unwrap(JSON.parse(l)));
}

// The timestamp columns hold UTC without a zone (as Prisma writes them). pg would send a Date in the
// local zone of this process, so dates go as UTC ISO strings (the zone suffix is ignored by Postgres).
const oidTime = id => new Date(parseInt(String(id).slice(0, 8), 16) * 1000);
const date = (v, id) => (v instanceof Date && !isNaN(v.getTime()) ? v : oidTime(id)).toISOString();
const optDate = v => (v instanceof Date && !isNaN(v.getTime()) ? v.toISOString() : null);
const int = (v, fallback = null) => {
	if (typeof v === 'boolean') return v ? 1 : 0;
	const n = typeof v === 'number' ? v : parseInt(String(v), 10);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const str = (v, fallback = null) => (v === undefined || v === null ? fallback : String(v));
const bool = (v, fallback) => (v === undefined || v === null ? fallback : Boolean(v));
const ints = v => (Array.isArray(v) ? v.map(x => int(x)).filter(x => x !== null) : []);
const strs = v => (Array.isArray(v) ? v.filter(x => x !== null && x !== undefined).map(String) : (typeof v === 'string' ? [v] : []));

// Fields each collection may carry that the import knowingly leaves out (anything else unknown is reported)
const dropped = { posts: ['screen_name', 'mii', 'mii_face_url', '__v'], communities: ['title_ids', '__v', 'followers'] };
const droppedCounts = {};
const unknown = {};
function noteFields(coll, doc, known) {
	for (const k of Object.keys(doc)) {
		if (k === '_id' || known.includes(k)) continue;
		if ((dropped[coll] ?? ['__v']).includes(k)) {
			droppedCounts[`${coll}.${k}`] = (droppedCounts[`${coll}.${k}`] ?? 0) + 1;
		} else {
			unknown[`${coll}.${k}`] = (unknown[`${coll}.${k}`] ?? 0) + 1;
		}
	}
}

const tables = [
	{
		file: 'communities', table: 'communities',
		cols: ['community_id', 'olive_community_id', 'legacy_mongo_id', 'platform_id', 'name', 'description', 'open', 'allows_comments', 'type', 'parent', 'admins', 'owner', 'created_at', 'empathy_count', 'has_shop_page', 'icon', 'ctr_header', 'wup_header', 'icon_path_32', 'icon_path_48', 'icon_path_64', 'icon_path_96', 'icon_path_128', 'title_id', 'is_recommended', 'app_data', 'user_favorites', 'permissions_open', 'minimum_new_post_access_level', 'minimum_new_comment_access_level', 'minimum_new_community_access_level', 'shot_mode', 'shot_extra_title_id', 'family', 'art_sha'],
		known: ['community_id', 'olive_community_id', 'platform_id', 'name', 'description', 'open', 'allows_comments', 'type', 'parent', 'admins', 'owner', 'created_at', 'empathy_count', 'has_shop_page', 'icon', 'ctr_header', 'wup_header', 'icon_paths', 'title_id', 'is_recommended', 'app_data', 'user_favorites', 'permissions', 'shot_mode', 'shot_extra_title_id', 'family', 'art_sha'],
		row: (d) => {
			const p = d.permissions ?? {};
			const i = d.icon_paths ?? null;
			return [str(d.community_id), str(d.olive_community_id), d._id, int(d.platform_id, 0), str(d.name, ''), str(d.description, ''),
				bool(d.open, true), bool(d.allows_comments, true), int(d.type, 0), str(d.parent), ints(d.admins), int(d.owner),
				date(d.created_at, d._id), int(d.empathy_count, 0), int(d.has_shop_page, 0), str(d.icon, ''), str(d.ctr_header), str(d.wup_header),
				i ? str(i[32]) : null, i ? str(i[48]) : null, i ? str(i[64]) : null, i ? str(i[96]) : null, i ? str(i[128]) : null,
				strs(d.title_id), int(d.is_recommended, 0), str(d.app_data, ''), ints(d.user_favorites),
				bool(p.open, true), int(p.minimum_new_post_access_level, 0), int(p.minimum_new_comment_access_level, 0), int(p.minimum_new_community_access_level, 3),
				['allow', 'block', 'force'].includes(d.shot_mode) ? d.shot_mode : 'allow', strs(d.shot_extra_title_id), bool(d.family, false), str(d.art_sha)];
		}
	},
	{
		file: 'posts', table: 'posts',
		cols: ['id', 'legacy_mongo_id', 'title_id', 'body', 'body_markdown', 'app_data', 'painting', 'painting_img', 'painting_big', 'screenshot', 'screenshot_big', 'screenshot_thumb', 'screenshot_length', 'screenshot_aspect', 'search_key', 'topic_tag', 'community_id', 'created_at', 'feeling_id', 'is_autopost', 'is_community_private_autopost', 'is_spoiler', 'is_app_jumpable', 'empathy_count', 'country_id', 'language_id', 'pid', 'platform_id', 'region_id', 'parent', 'reply_count', 'verified', 'message_to_pid', 'removed', 'removed_reason', 'removed_by', 'removed_at', 'yeahs'],
		known: ['id', 'title_id', 'body', 'body_markdown', 'app_data', 'painting', 'painting_img', 'painting_big', 'screenshot', 'screenshot_big', 'screenshot_thumb', 'screenshot_length', 'screenshot_aspect', 'search_key', 'topic_tag', 'community_id', 'created_at', 'feeling_id', 'is_autopost', 'is_community_private_autopost', 'is_spoiler', 'is_app_jumpable', 'empathy_count', 'country_id', 'language_id', 'pid', 'platform_id', 'region_id', 'parent', 'reply_count', 'verified', 'message_to_pid', 'removed', 'removed_reason', 'removed_by', 'removed_at', 'yeahs'],
		row: d => [str(d.id) || d._id, d._id, str(d.title_id), str(d.body, ''), str(d.body_markdown), str(d.app_data),
			str(d.painting), str(d.painting_img), str(d.painting_big), str(d.screenshot), str(d.screenshot_big), str(d.screenshot_thumb),
			int(d.screenshot_length), str(d.screenshot_aspect), strs(d.search_key), str(d.topic_tag), str(d.community_id, ''),
			date(d.created_at, d._id), int(d.feeling_id), int(d.is_autopost, 0), int(d.is_community_private_autopost, 0), int(d.is_spoiler, 0),
			int(d.is_app_jumpable, 0), int(d.empathy_count, 0), int(d.country_id, 49), int(d.language_id, 1), int(d.pid, 0),
			int(d.platform_id), int(d.region_id), str(d.parent), int(d.reply_count, 0), bool(d.verified, false), str(d.message_to_pid),
			bool(d.removed, false), str(d.removed_reason), int(d.removed_by), optDate(d.removed_at), ints(d.yeahs)]
	},
	{
		file: 'conversations', table: 'conversations',
		cols: ['id', 'legacy_mongo_id', 'created_at', 'last_updated', 'message_preview'],
		known: ['id', 'created_at', 'last_updated', 'message_preview', 'users'],
		row: d => [str(d.id) || d._id, d._id, date(d.created_at, d._id), date(d.last_updated, d._id), str(d.message_preview, '')],
		children: async (q, d) => {
			for (const u of Array.isArray(d.users) ? d.users : []) {
				if (int(u.pid) === null) continue;
				await q.query('INSERT INTO conversation_users (conversation_id, pid, official, read) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
					[str(d.id) || d._id, int(u.pid), bool(u.official, false), bool(u.read, true)]);
			}
		}
	},
	{
		file: 'endpoints', table: 'endpoints',
		cols: ['legacy_mongo_id', 'status', 'server_access_level', 'topics', 'guest_access', 'new_users', 'host', 'api_host', 'portal_host', 'n3ds_host'],
		known: ['status', 'server_access_level', 'topics', 'guest_access', 'new_users', 'host', 'api_host', 'portal_host', 'n3ds_host'],
		row: d => [d._id, int(d.status, 0), str(d.server_access_level, ''), bool(d.topics, false), bool(d.guest_access, false), bool(d.new_users, true),
			str(d.host, ''), str(d.api_host, ''), str(d.portal_host, ''), str(d.n3ds_host, '')]
	},
	{
		file: 'reports', table: 'reports',
		cols: ['id', 'legacy_mongo_id', 'pid', 'reported_by', 'post_id', 'reason', 'message', 'created_at', 'resolved', 'note', 'resolved_by', 'resolved_at'],
		known: ['pid', 'reported_by', 'post_id', 'reason', 'message', 'created_at', 'resolved', 'note', 'resolved_by', 'resolved_at'],
		row: d => [d._id, d._id, int(d.pid, 0), int(d.reported_by, 0), str(d.post_id, ''), int(d.reason, 0), str(d.message, ''), date(d.created_at, d._id),
			bool(d.resolved, false), str(d.note), int(d.resolved_by), optDate(d.resolved_at)]
	},
	{
		file: 'automodrules', table: 'automod_rules',
		cols: ['id', 'legacy_mongo_id', 'enabled', 'created_at', 'title', 'description', 'type', 'mode', 'keywords'],
		known: ['enabled', 'created_at', 'title', 'description', 'type', 'mode', 'keyword_settings'],
		row: d => [d._id, d._id, bool(d.enabled, false), date(d.created_at, d._id), str(d.title, ''), str(d.description), str(d.type, 'keyword'),
			str(d.mode, 'log'), strs(d.keyword_settings?.keywords)]
	},
	{
		file: 'automodlogs', table: 'automod_logs',
		cols: ['id', 'legacy_mongo_id', 'rule_id', 'created_at', 'author', 'action', 'post_id', 'parent_post_id', 'community_id', 'matches', 'post_content_body'],
		known: ['rule_id', 'created_at', 'author', 'action', 'post_id', 'parent_post_id', 'community_id', 'matches', 'post_content_body'],
		row: d => [d._id, d._id, str(d.rule_id, ''), date(d.created_at, d._id), int(d.author, 0), str(d.action, 'logged'), str(d.post_id), str(d.parent_post_id),
			str(d.community_id), Array.isArray(d.matches) ? JSON.stringify(d.matches.map(m => ({ start: int(m.start, 0), end: int(m.end, 0) }))) : null,
			str(d.post_content_body)]
	},
	{
		file: 'logs', table: 'audit_logs',
		cols: ['id', 'legacy_mongo_id', 'actor', 'action', 'target', 'context', 'timestamp', 'changed_fields'],
		known: ['actor', 'action', 'target', 'context', 'timestamp', 'changed_fields'],
		row: d => [d._id, d._id, int(d.actor, 0), str(d.action, ''), str(d.target, ''), str(d.context, ''), date(d.timestamp, d._id), strs(d.changed_fields)]
	}
];

// Every distinct post author must be known to the account core: a console pid to nn-account's resolver,
// a web-only pid to a web identity (the OpenPak account it was handed out for), Pakka is fixed.
async function checkAuthors(pool, posts) {
	const byPid = new Map();
	for (const p of posts) {
		const pid = int(p.pid);
		byPid.set(pid, (byPid.get(pid) ?? 0) + 1);
	}
	const nnasUrl = process.env.PN_MIIVERSE_API_OPENPAK_NNAS_URL ?? '';
	const nnasKey = process.env.PN_MIIVERSE_API_OPENPAK_NNAS_KEY ?? '';
	const pids = [...byPid.keys()];
	const unresolved = [];
	const consolePids = pids.filter(pid => pid !== null && pid !== OFFICIAL_PID && pid < WEB_ONLY_PID_MIN);
	const webPids = pids.filter(pid => pid !== null && pid !== OFFICIAL_PID && pid >= WEB_ONLY_PID_MIN);
	if (pids.includes(null)) unresolved.push({ pid: null, posts: byPid.get(null), why: 'no pid on the post' });

	if (webPids.length > 0) {
		const known = new Set((await pool.query('SELECT pid FROM web_identities WHERE pid = ANY($1::int[])', [webPids])).rows.map(r => r.pid));
		for (const pid of webPids) if (!known.has(pid)) unresolved.push({ pid, posts: byPid.get(pid), why: 'no web identity' });
	}
	if (consolePids.length > 0 && nnasUrl === '') {
		console.error('author check: PN_MIIVERSE_API_OPENPAK_NNAS_URL is not set, console authors cannot be checked');
		for (const pid of consolePids) unresolved.push({ pid, posts: byPid.get(pid), why: 'not checked (no resolver configured)' });
	} else {
		for (let i = 0; i < consolePids.length; i += 8) {
			await Promise.all(consolePids.slice(i, i + 8).map(async (pid) => {
				try {
					const res = await fetch(`${nnasUrl}/internal/resolve/pid?namespace=wiiu&pid=${pid}`, { headers: { 'X-Internal-Key': nnasKey }, signal: AbortSignal.timeout(10_000) });
					const body = res.ok ? await res.json() : null;
					if (!body?.found) unresolved.push({ pid, posts: byPid.get(pid), why: res.ok ? 'unknown to the account core' : `resolver answered ${res.status}` });
				} catch (e) {
					unresolved.push({ pid, posts: byPid.get(pid), why: `resolver unreachable (${e.name})` });
				}
			}));
		}
	}
	console.log(`author check: ${pids.length} distinct post authors (${consolePids.length} console, ${webPids.length} web-only), ${unresolved.length} unresolved`);
	for (const u of unresolved.sort((a, b) => (a.pid ?? 0) - (b.pid ?? 0))) {
		console.log(`  unresolved pid=${u.pid} posts=${u.posts} (${u.why})`);
	}
	return unresolved.length;
}

(async () => {
	const url = process.env.PN_MIIVERSE_API_DB_URL;
	if (!url) {
		console.error('PN_MIIVERSE_API_DB_URL is not set');
		process.exit(2);
	}
	const pool = new Pool({ connectionString: url });
	const data = Object.fromEntries(tables.map(t => [t.file, read(t.file)]));

	const unresolved = await checkAuthors(pool, data.posts);
	if (checkOnly) {
		await pool.end();
		process.exit(unresolved > 0 ? 3 : 0);
	}
	if (unresolved > 0 && !allowUnresolved) {
		console.error('import refused: post authors above do not resolve in the account core (rerun with --allow-unresolved to import anyway)');
		await pool.end();
		process.exit(3);
	}

	const count = async (t, legacyOnly) => Number((await pool.query(`SELECT count(*) FROM ${t}${legacyOnly ? ' WHERE legacy_mongo_id IS NOT NULL' : ''}`)).rows[0].count);
	const report = async (label) => {
		for (const t of tables) {
			console.log(`${label} ${t.table} mongo ${data[t.file].length} postgres ${await count(t.table, false)} (imported ${await count(t.table, true)})`);
		}
	};
	await report('before');

	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		for (const t of tables) {
			const ph = t.cols.map((_, i) => `$${i + 1}`).join(', ');
			const sql = `INSERT INTO ${t.table} (${t.cols.join(', ')}) VALUES (${ph}) ON CONFLICT DO NOTHING`;
			for (const d of data[t.file]) {
				noteFields(t.file, d, t.known);
				await client.query(sql, t.row(d));
				if (t.children) await t.children(client, d);
			}
		}
		await client.query('COMMIT');
	} catch (e) {
		await client.query('ROLLBACK');
		throw e;
	} finally {
		client.release();
	}

	for (const [k, n] of Object.entries(droppedCounts)) console.log(`left out on purpose: ${k} on ${n} documents`);
	for (const [k, n] of Object.entries(unknown)) console.log(`warning: unknown field ${k} on ${n} documents (not imported)`);

	await report('after');
	let bad = 0;
	for (const t of tables) {
		const imported = await count(t.table, true);
		if (imported !== data[t.file].length) {
			console.error(`MISMATCH ${t.table}: ${data[t.file].length} lines, ${imported} imported rows (a row with the same id may already exist)`);
			bad++;
		}
	}
	await pool.end();
	console.log(bad ? `import incomplete: ${bad} table(s) differ` : 'import complete: every table matches');
	process.exit(bad ? 1 : 0);
})().catch((e) => {
	console.error(e);
	process.exit(2);
});
