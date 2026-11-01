import type { ICommunityInput } from '@/types/mongoose/community';

/* Game communities the server needs to exist before a console can post to them.
 *
 * Miiverse games find their community by title ID (paramPack title_id, a decimal Wii U title
 * ID), so a game with no community document cannot post at all (posts.ts answers NOT_FOUND).
 *
 * Super Mario Maker (Wii U), one community for the three regions. The game posts course
 * comments and course-clear posts into its title community and tags them for lookup with
 * search_key and app_data, both of which this server already stores and filters on
 * (GET .../communities/:id/posts?search_key=...). The course ID is what the game puts there; it
 * has not been seen on a real console yet (see docs/smm1.md), so nothing here depends on its
 * exact form.
 */

export type TitleCommunitySeed = Omit<ICommunityInput, 'community_id' | 'olive_community_id'>;

// 0005000010 + 1018DA00 (JPN), 1018DB00 (USA), 1018DC00 (EUR), as decimal strings
export const SMM_WIIU_TITLE_IDS = ['1407375153617408', '1407375153617664', '1407375153617920'];

// A one-pixel placeholder; replace it from the admin panel with the game's real icon.
const PLACEHOLDER_ICON = 'AA==';

export function buildTitleCommunitySeeds(): TitleCommunitySeed[] {
	return [
		{
			platform_id: 0, // Wii U
			name: 'Super Mario Maker',
			description: 'Course comments and clear posts for Super Mario Maker.',
			open: true,
			allows_comments: true,
			type: 0,
			icon: PLACEHOLDER_ICON,
			title_id: SMM_WIIU_TITLE_IDS,
			app_data: '',
			permissions: {
				open: true,
				minimum_new_post_access_level: 0,
				minimum_new_comment_access_level: 0,
				// users cannot add sub-communities here: a course is not a community
				minimum_new_community_access_level: 3
			}
		}
	];
}

export type CommunityStore = {
	existsForTitleId(titleId: string): Promise<boolean>;
	create(seed: TitleCommunitySeed): Promise<void>;
};

/* Idempotent: creates a seed only when none of its title IDs already has a community, so
 * hand edits made in the admin panel are kept. Returns the names it created. */
export async function ensureTitleCommunities(store: CommunityStore, seeds = buildTitleCommunitySeeds()): Promise<string[]> {
	const created: string[] = [];
	for (const seed of seeds) {
		let found = false;
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
