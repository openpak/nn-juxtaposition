/* OpenPak automatic activity posts.
 *
 * A player can opt in (off by default, per category) to have notable moments posted for them: a badge
 * earned, a course uploaded, a trade completed. A server (the rewards service, a game server) reports a
 * moment with POST /internal/v1/activity; this module decides what becomes a post.
 *
 * - Posts are a category, a subject name (the badge name), an optional link and an optional image that
 *   comes from OpenPak's own art (an allow-listed https host). Never a game screenshot.
 * - `event_id` makes a report idempotent: a retry changes nothing.
 * - Rate limit: at most DAILY_MAX posts per account per UTC day and BURST_MAX within BURST_WINDOW_MS.
 *   Moments past that are not lost, they are counted in one digest post per day ("and 3 more moments").
 */

export const CATEGORY_IDS = ['badge', 'splatfest', 'kart', 'maker', 'trophy', 'trade'] as const;
export type CategoryId = typeof CATEGORY_IDS[number];

export const DAILY_MAX = 10;
export const BURST_MAX = 4;
export const BURST_WINDOW_MS = 10 * 60 * 1000;
/** A moment older than this is stale (a late retry must not post last week's news). */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isCategory(v: string): v is CategoryId {
	return (CATEGORY_IDS as readonly string[]).includes(v);
}

/** The categories a source exists for (config), in the canonical order. */
export function liveCategories(csv: string): CategoryId[] {
	const wanted = new Set(csv.split(',').map(v => v.trim()).filter(Boolean));
	return CATEGORY_IDS.filter(c => wanted.has(c));
}

const HOST_RE = /^[a-z0-9.-]+$/;

/** A link on this site, or an https link to openpak.org or one of its subdomains. Anything else is dropped. */
export function cleanLink(link: string | undefined | null): string {
	const v = (link ?? '').trim();
	if (v === '' || v.length > 300) {
		return '';
	}
	if (v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) {
		return v;
	}
	try {
		const u = new URL(v);
		if (u.protocol === 'https:' && (u.hostname === 'openpak.org' || u.hostname.endsWith('.openpak.org'))) {
			return u.toString();
		}
	} catch {
		// fall through
	}
	return '';
}

/** Art may only come from our own hosts (config.activity.imageHosts), over https. */
export function cleanImage(image: string | undefined | null, hostsCsv: string): string {
	const v = (image ?? '').trim();
	if (v === '' || v.length > 300) {
		return '';
	}
	const hosts = hostsCsv.split(',').map(h => h.trim().toLowerCase()).filter(h => HOST_RE.test(h));
	try {
		const u = new URL(v);
		if (u.protocol === 'https:' && u.username === '' && u.password === '' && hosts.includes(u.hostname.toLowerCase())) {
			return u.toString();
		}
	} catch {
		// fall through
	}
	return '';
}

export function cleanSubject(subject: string | undefined | null): string {
	// eslint-disable-next-line no-control-regex -- stripping control characters is the point
	return (subject ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80);
}

export type PostRow = {
	id: number;
	eventId: string;
	accountId: string;
	category: string;
	subject: string;
	link: string;
	image: string;
	digest: boolean;
	folded: boolean;
	count: number;
	createdAt: Date;
};

type CountWhere = { accountId: string; digest: false; folded: false; createdAt: { gte: Date } };

/** The few Prisma calls this module needs, so tests can pass a plain object. */
export type ActivityDb = {
	webIdentity: { findUnique(args: { where: { accountId: string } }): Promise<{ accountId: string } | null> };
	activitySetting: {
		findUnique(args: { where: { accountId: string } }): Promise<{ accountId: string; enabled: boolean; categories: string[] } | null>;
	};
	activityPost: {
		findUnique(args: { where: { eventId: string } }): Promise<PostRow | null>;
		count(args: { where: CountWhere }): Promise<number>;
		create(args: { data: Omit<PostRow, 'id'> }): Promise<PostRow>;
		upsert(args: {
			where: { eventId: string };
			create: Omit<PostRow, 'id'>;
			update: { count: { increment: number }; createdAt: Date };
		}): Promise<PostRow>;
	};
};

export type ActivityInput = {
	eventId: string;
	accountId: string;
	category: string;
	subject?: string;
	link?: string;
	image?: string;
	occurredAt?: Date | null;
};

export type IngestStatus = 'posted' | 'digested' | 'duplicate' | 'not_opted_in' | 'no_account' | 'supervised' | 'rejected';

export type IngestOptions = {
	live: CategoryId[];
	imageHosts: string;
	/** True when the account is supervised (read-only on the web): nothing is posted for it. */
	isReadOnly(accountId: string): Promise<boolean>;
	now?: Date;
};

export type IngestResult = { status: IngestStatus; error?: string };

function isUniqueViolation(e: unknown): boolean {
	return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

export function utcDayStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function digestEventId(accountId: string, now: Date): string {
	return `digest:${accountId}:${utcDayStart(now).toISOString().slice(0, 10)}`;
}

export async function ingestActivity(db: ActivityDb, input: ActivityInput, opts: IngestOptions): Promise<IngestResult> {
	const now = opts.now ?? new Date();
	if (!isCategory(input.category)) {
		return { status: 'rejected', error: 'unknown category' };
	}
	if (input.occurredAt && now.getTime() - input.occurredAt.getTime() > MAX_AGE_MS) {
		return { status: 'rejected', error: 'occurred_at is older than 7 days' };
	}
	const subject = cleanSubject(input.subject);
	if (subject === '') {
		return { status: 'rejected', error: 'subject is required' };
	}

	if (await db.activityPost.findUnique({ where: { eventId: input.eventId } })) {
		return { status: 'duplicate' };
	}
	if (!await db.webIdentity.findUnique({ where: { accountId: input.accountId } })) {
		return { status: 'no_account' };
	}
	const setting = await db.activitySetting.findUnique({ where: { accountId: input.accountId } });
	if (!setting?.enabled || !opts.live.includes(input.category) || !setting.categories.includes(input.category)) {
		return { status: 'not_opted_in' };
	}
	if (await opts.isReadOnly(input.accountId)) {
		return { status: 'supervised' };
	}

	const row = {
		eventId: input.eventId,
		accountId: input.accountId,
		category: input.category,
		subject,
		link: cleanLink(input.link),
		image: cleanImage(input.image, opts.imageHosts),
		digest: false,
		folded: false,
		count: 1,
		createdAt: now
	};

	const today = await db.activityPost.count({ where: { accountId: input.accountId, digest: false, folded: false, createdAt: { gte: utcDayStart(now) } } });
	const burst = await db.activityPost.count({ where: { accountId: input.accountId, digest: false, folded: false, createdAt: { gte: new Date(now.getTime() - BURST_WINDOW_MS) } } });
	const fold = today >= DAILY_MAX || burst >= BURST_MAX;

	try {
		if (!fold) {
			await db.activityPost.create({ data: row });
			return { status: 'posted' };
		}
		await db.activityPost.create({ data: { ...row, folded: true } });
		await db.activityPost.upsert({
			where: { eventId: digestEventId(input.accountId, now) },
			create: {
				eventId: digestEventId(input.accountId, now),
				accountId: input.accountId,
				category: 'digest',
				subject: '',
				link: '',
				image: '',
				digest: true,
				folded: false,
				count: 1,
				createdAt: now
			},
			update: { count: { increment: 1 }, createdAt: now }
		});
		return { status: 'digested' };
	} catch (e) {
		if (isUniqueViolation(e)) {
			return { status: 'duplicate' };
		}
		throw e;
	}
}
