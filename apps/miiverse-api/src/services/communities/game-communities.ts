import crypto from 'node:crypto';

/* One OpenVerse community per game OpenPak serves (docs/web-sso.md, "Game communities").
 *
 * The bundle comes from tools/game-communities/build.py: one entry per game, the same game on
 * several consoles merged into one. Applied by `npm run db:sync-games -- <bundle dir>`.
 * Idempotent: it creates what is missing and updates names, title IDs and art, and never deletes. */

export type GameEntry = {
	/** The website's slug of the game name, e.g. "mario-kart-8" */
	key: string;
	name: string;
	/** Console names as the website shows them, for the description */
	consoles: string[];
	/** 0 Wii U only, 1 3DS only, 2 anything else */
	platform_id: number;
	/** Decimal title IDs of the Wii U, 3DS and Switch builds: what a console sends in its param pack */
	title_ids: string[];
	/** PNG under the bundle directory, or null for the generated letter icon */
	icon: string | null;
	/** #rrggbb behind the letter on the banners (and the letter icon) */
	color: string;
};

/**
 * The community id of a game. Fixed by the key, so the website can link to a game's community
 * without asking OpenVerse (the Go twin lives in the website, internal/pages). 64-bit with the top
 * bit set, like every community created here.
 */
export function communityIdForKey(key: string): string {
	const hash = crypto.createHash('sha256').update(`openverse-game:${key}`).digest();
	return (hash.readBigUInt64BE(0) | (1n << 63n)).toString();
}

export function describeGame(game: Pick<GameEntry, 'name' | 'consoles'>): string {
	const on = game.consoles.length > 0 ? ` on ${joinList(game.consoles)}` : '';
	return `Talk about ${game.name}${on}. Share tips, drawings and finds with other players.`.slice(0, 280);
}

function joinList(items: string[]): string {
	if (items.length <= 1) {
		return items.join('');
	}
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What a community already holds that the sync compares against. */
export type Existing = {
	olive_community_id: string;
	name: string;
	description: string;
	title_id: string[];
	/** Hash of the art last written by the sync; absent for a community made by hand */
	art_sha?: string;
};

export type Update = {
	name?: string;
	description?: string;
	title_id?: string[];
	art: boolean;
};

/** The art hash: the icon file and the colour the banners use, so a change in either redraws. */
export function artHash(icon: Buffer | null, color: string, letter: string): string {
	return crypto.createHash('sha256').update(icon ?? '').update(`|${color}|${letter}`).digest('hex').slice(0, 24);
}

/**
 * What to change on an existing community. A community the sync made (it has art_sha) keeps
 * following the bundle: name, description, title IDs and art. One made by hand is adopted: the
 * name, title IDs and art come from the bundle, its description is left as written.
 * Title IDs only ever grow.
 */
export function planUpdate(existing: Existing, game: GameEntry, sha: string): Update | null {
	const update: Update = { art: existing.art_sha !== sha };
	if (existing.name !== game.name) {
		update.name = game.name;
	}
	const description = describeGame(game);
	if (existing.art_sha !== undefined && existing.description !== description) {
		update.description = description;
	}
	const merged = [...new Set([...existing.title_id, ...game.title_ids])];
	if (merged.length !== existing.title_id.length) {
		update.title_id = merged;
	}
	if (!update.art && update.name === undefined && update.description === undefined && update.title_id === undefined) {
		return null;
	}
	return update;
}

/* ---- families -------------------------------------------------------------------------------
 * OpenVerse shows one page per franchise ("Mario Kart") with each game as a sub-community under it.
 * The mapping is tools/game-communities/families.json, written and checked by hand. A family is a
 * Sub community (so no console list ever shows it) that the member games name as their `parent`;
 * the games keep their ids, posts and console behaviour. Applied by families.entry.ts. */

export type FamilyEntry = {
	/** Stable id part, e.g. "mario-kart" */
	slug: string;
	name: string;
	/** Game names exactly as their communities are named, newest game first (its art becomes the family's) */
	games: string[];
};

/** The community id of a family: fixed by the slug, so it never changes when the games do. */
export function familyIdForSlug(slug: string): string {
	return communityIdForKey(`family:${slug}`);
}

export function describeFamily(name: string): string {
	return `Every ${name} game in one place. Pick a game to see its posts, or read them all together.`.slice(0, 280);
}

/** What is wrong with a mapping, as sentences: empty when it can be applied. */
export function checkFamilies(families: FamilyEntry[]): string[] {
	const problems: string[] = [];
	const slugs = new Set<string>();
	const owner = new Map<string, string>();
	for (const f of families) {
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) {
			problems.push(`${f.slug}: slug must be lowercase words joined by dashes`);
		}
		if (slugs.has(f.slug)) {
			problems.push(`${f.slug}: listed twice`);
		}
		slugs.add(f.slug);
		if (f.games.length < 2) {
			problems.push(`${f.slug}: a family needs at least two games (a single game stays on its own)`);
		}
		for (const g of f.games) {
			const key = g.toLowerCase();
			if (owner.has(key)) {
				problems.push(`${g}: in both ${owner.get(key)} and ${f.slug}`);
			}
			owner.set(key, f.slug);
		}
	}
	return problems;
}
