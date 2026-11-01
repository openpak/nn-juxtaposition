import { describe, expect, it } from 'vitest';
import { buildTitleCommunitySeeds, ensureTitleCommunities, SMM_WIIU_TITLE_IDS } from '@/services/communities/title-communities';
import type { CommunityStore, TitleCommunitySeed } from '@/services/communities/title-communities';

function memoryStore(existing: string[] = []): CommunityStore & { created: TitleCommunitySeed[] } {
	const created: TitleCommunitySeed[] = [];
	return {
		created,
		existsForTitleId: async id => existing.includes(id) || created.some(c => c.title_id?.includes(id)),
		create: async seed => { created.push(seed); }
	};
}

describe('Super Mario Maker community seed', () => {
	it('covers the three Wii U regions as decimal title IDs', () => {
		expect(SMM_WIIU_TITLE_IDS.map(id => BigInt(id).toString(16).padStart(16, '0'))).toEqual([
			'000500001018da00', '000500001018db00', '000500001018dc00'
		]);
		const [seed] = buildTitleCommunitySeeds();
		expect(seed.title_id).toEqual(SMM_WIIU_TITLE_IDS);
		expect(seed.platform_id).toBe(0);
	});

	it('does not let players create sub-communities', () => {
		expect(buildTitleCommunitySeeds()[0].permissions?.minimum_new_community_access_level).toBe(3);
	});

	it('creates once and leaves an existing community alone', async () => {
		const store = memoryStore();
		expect(await ensureTitleCommunities(store)).toEqual(['Super Mario Maker']);
		expect(await ensureTitleCommunities(store)).toEqual([]);
		expect(store.created).toHaveLength(1);

		const hand = memoryStore([SMM_WIIU_TITLE_IDS[1]]);
		expect(await ensureTitleCommunities(hand)).toEqual([]);
	});
});
