import type { ICommunityInput } from '@/types/models/community';

/* The communities a fresh OpenVerse starts with (docs/web-sso.md, "Seeded communities").
 *
 * - General rooms every player can use from the web or a console.
 * - One room per console family, for people whose games have no community of their own.
 * - Super Mario Maker (Wii U): the game finds its community by title ID and cannot post without it.
 *
 * Applied by `npm run db:seed`. Idempotent: a community is created only when none with the same
 * name (or, for a game, the same title ID) exists, so edits made later in the admin panel stay. */

export type SeedCommunity = Omit<ICommunityInput, 'community_id' | 'olive_community_id' | 'icon'> & {
	/** One capital letter drawn on the generated icon and banners */
	letter: string;
	/** #rrggbb */
	color: string;
};

const open = {
	open: true,
	minimum_new_post_access_level: 0,
	minimum_new_comment_access_level: 0,
	// players do not add sub-communities to these
	minimum_new_community_access_level: 3
};

// A few general rooms, same permissions, different art.
function room(name: string, description: string, letter: string, color: string, extra: Partial<SeedCommunity> = {}): SeedCommunity {
	return { platform_id: 2, name, description, letter, color, open: true, allows_comments: true, type: 0, app_data: '', permissions: open, ...extra };
}

export function buildSeedCommunities(): SeedCommunity[] {
	return [
		// Only the team posts here; everyone can read and Yeah.
		room('Announcements', 'News and updates from the OpenPak team.', 'A', '#4f46e5', {
			type: 2,
			permissions: { ...open, minimum_new_post_access_level: 3, minimum_new_comment_access_level: 0 }
		}),
		room('Help', 'Stuck? Ask a question and other players will help.', 'H', '#0b7285'),
		room('Introductions', 'New here? Say hello and tell us what you play.', 'I', '#2f9e44'),
		room('Off-topic', 'Anything that is not about a game.', 'O', '#b8590b'),
		room('Drawing and Art', 'Share your drawings and fan art.', 'D', '#c2255c'),
		room('Feedback', 'Tell us what works and what does not.', 'F', '#6741d9'),
		room('Switch', 'Everything about Switch games.', 'S', '#e03131'),
		room('Wii U and 3DS', 'Everything about Wii U and 3DS games.', 'W', '#1c7ed6'),
		{
			platform_id: 0, // Wii U
			name: 'Super Mario Maker',
			description: 'Course comments and clear posts for Super Mario Maker.',
			letter: 'M',
			color: '#d9480f',
			open: true,
			allows_comments: true,
			type: 0,
			// 0005000010 + 1018DA00 (JPN), 1018DB00 (USA), 1018DC00 (EUR), as decimal strings
			title_id: ['1407375153617408', '1407375153617664', '1407375153617920'],
			app_data: '',
			permissions: open
		}
	];
}

export type SeedStore = {
	existsByName(name: string): Promise<boolean>;
	existsForTitleId(titleId: string): Promise<boolean>;
	create(seed: SeedCommunity): Promise<void>;
};

/** Creates the missing seeds and returns the names it created. */
export async function ensureSeedCommunities(store: SeedStore, seeds = buildSeedCommunities()): Promise<string[]> {
	const created: string[] = [];
	for (const seed of seeds) {
		let found = await store.existsByName(seed.name);
		for (const id of seed.title_id ?? []) {
			found = found || await store.existsForTitleId(id);
		}
		if (found) {
			continue;
		}
		await store.create(seed);
		created.push(seed.name);
	}
	return created;
}
