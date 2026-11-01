import { describe, expect, it } from 'vitest';
import { artHash, communityIdForKey, describeGame, planUpdate } from '@/services/communities/game-communities';
import type { GameEntry } from '@/services/communities/game-communities';

const game: GameEntry = { key: 'terraria', name: 'Terraria', consoles: ['Wii U', 'Switch'], platform_id: 2, title_ids: ['1', '2'], icon: null, color: '#336699' };

describe('communityIdForKey', () => {
	it('is stable and 64-bit with the top bit set', () => {
		const id = communityIdForKey('terraria');
		expect(id).toBe(communityIdForKey('terraria'));
		expect(id).not.toBe(communityIdForKey('mario-kart-8'));
		expect(BigInt(id) >= (1n << 63n)).toBe(true);
	});
	it('matches the website twin', () => {
		expect(communityIdForKey('terraria')).toBe('12406839772376467666');
	});
});

describe('describeGame', () => {
	it('lists the consoles', () => {
		expect(describeGame(game)).toBe('Talk about Terraria on Wii U and Switch. Share tips, drawings and finds with other players.');
	});
});

describe('planUpdate', () => {
	const sha = artHash(null, game.color, 'T');
	const synced = { olive_community_id: '1', name: 'Terraria', description: describeGame(game), title_id: ['1', '2'], art_sha: sha };

	it('does nothing when the community is current', () => {
		expect(planUpdate(synced, game, sha)).toBeNull();
	});
	it('redraws when the art changed', () => {
		expect(planUpdate({ ...synced, art_sha: 'old' }, game, sha)?.art).toBe(true);
	});
	it('renames and grows title ids, never shrinks them', () => {
		const u = planUpdate({ ...synced, name: 'Terraria 1', title_id: ['2', '9'] }, game, sha);
		expect(u?.name).toBe('Terraria');
		expect(u?.title_id).toEqual(['2', '9', '1']);
	});
	it('leaves the description of a hand-made community alone', () => {
		const u = planUpdate({ ...synced, art_sha: undefined, description: 'mine' }, game, sha);
		expect(u?.description).toBeUndefined();
		expect(u?.art).toBe(true);
	});
});
