import { describe, expect, it } from 'vitest';
import { buildSeedCommunities, ensureSeedCommunities } from '@/services/communities/seed-communities';
import { hexColor, renderAvatar, renderBanner, renderIcon } from '@/services/communities/seed-images';
import type { SeedCommunity, SeedStore } from '@/services/communities/seed-communities';

function memoryStore(existing: string[] = []): SeedStore & { created: SeedCommunity[] } {
	const created: SeedCommunity[] = [];
	return {
		created,
		existsByName: async name => existing.includes(name) || created.some(c => c.name === name),
		existsForTitleId: async id => created.some(c => c.title_id?.includes(id)),
		create: async (seed) => {
			created.push(seed);
		}
	};
}

describe('seeded communities', () => {
	it('lists the rooms from the rebuild plan plus Super Mario Maker', () => {
		expect(buildSeedCommunities().map(c => c.name)).toEqual([
			'Announcements', 'Help', 'Introductions', 'Off-topic', 'Drawing and Art', 'Feedback',
			'Switch', 'Wii U and 3DS', 'Super Mario Maker'
		]);
	});

	it('gives every community a unique letter, a description and art', () => {
		const seeds = buildSeedCommunities();
		expect(new Set(seeds.map(c => c.letter)).size).toBe(seeds.length);
		for (const seed of seeds) {
			expect(seed.description.length).toBeGreaterThan(10);
			expect(seed.color).toMatch(/^#[0-9a-f]{6}$/);
			expect(renderIcon(seed.letter, hexColor(seed.color)).length).toBeGreaterThan(100);
		}
	});

	it('puts Super Mario Maker on the three Wii U region title IDs', () => {
		const smm = buildSeedCommunities().find(c => c.name === 'Super Mario Maker')!;
		expect(smm.platform_id).toBe(0);
		expect(smm.title_id!.map(id => BigInt(id).toString(16).padStart(16, '0'))).toEqual([
			'000500001018da00', '000500001018db00', '000500001018dc00'
		]);
	});

	it('only lets the team post in Announcements', () => {
		const ann = buildSeedCommunities()[0]!;
		expect(ann.type).toBe(2);
		expect(ann.permissions!.minimum_new_post_access_level).toBe(3);
	});

	it('creates everything once and nothing on the second run', async () => {
		const store = memoryStore();
		expect(await ensureSeedCommunities(store)).toHaveLength(9);
		expect(await ensureSeedCommunities(store)).toEqual([]);
	});

	it('leaves a community that already exists alone', async () => {
		const store = memoryStore(['Help']);
		const created = await ensureSeedCommunities(store);
		expect(created).not.toContain('Help');
		expect(created).toHaveLength(8);
	});
});

describe('generated art', () => {
	function size(png: Buffer): [number, number] {
		expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
		expect(png.subarray(12, 16).toString()).toBe('IHDR');
		return [png.readUInt32BE(16), png.readUInt32BE(20)];
	}

	it('makes a 256x256 icon and the two banner sizes the server accepts', () => {
		const color = hexColor('#4f46e5');
		expect(size(renderIcon('A', color))).toEqual([256, 256]);
		expect(size(renderBanner('A', color, 400, 220))).toEqual([400, 220]);
		expect(size(renderBanner('A', color, 1280, 180))).toEqual([1280, 180]);
	});

	it('draws the default avatar at the size asked for', () => {
		expect(size(renderAvatar())).toEqual([256, 256]);
		expect(size(renderAvatar(128))).toEqual([128, 128]);
	});

	it('is deterministic', () => {
		const color = hexColor('#4f46e5');
		expect(renderIcon('H', color).equals(renderIcon('H', color))).toBe(true);
	});
});
