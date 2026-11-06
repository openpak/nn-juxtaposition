import '@/extend-zod'; // Needs to be the first import
import crypto from 'node:crypto';
import { config } from '@/config';
import { getDb, setupPrisma } from '@/database';
import { Endpoint } from '@/models/endpoint';
import { buildEndpointSeeds } from '@/services/discovery/endpoints';
import { Community } from '@/models/community';
import { buildSeedCommunities, ensureSeedCommunities } from '@/services/communities/seed-communities';
import { hexColor, renderAvatar, renderBanner, renderIcon } from '@/services/communities/seed-images';
import { initImageProcessing, uploadHeaders, uploadIcons } from '@/images';
import { generateCommunityId } from '@/services/internal/utils/communities';
import { setupS3 } from '@/s3';
import { uploadCDNAsset } from '@/util';
import type { SeedCommunity } from '@/services/communities/seed-communities';

// Idempotent: creates the missing endpoint documents and communities and leaves existing ones
// (and any hand edits to them) alone.
await setupPrisma();
setupS3();
await initImageProcessing();

for (const seed of buildEndpointSeeds(config.domains)) {
	const existing = await Endpoint.findByAccessLevel(seed.server_access_level);
	if (existing) {
		console.log(`endpoint ${seed.server_access_level}: exists, left alone`);
		continue;
	}
	await Endpoint.create(seed);
	console.log(`endpoint ${seed.server_access_level}: created`);
}

// The face a web-only player has in console views (they have no Mii). The six expression files
// a post can name all show the same picture. Written every run; the content never changes.
const avatar = renderAvatar();
for (const face of ['normal_face', 'smile_open_mouth', 'wink_left', 'surprise_open_mouth', 'frustrated', 'sorrow']) {
	if (!await uploadCDNAsset(`mii/default/${face}.png`, avatar, 'public-read')) {
		throw new Error(`Could not upload the default avatar (${face})`);
	}
}
console.log('default avatar: uploaded');

// Starting communities. Each gets real icon and banner artwork, written through the same pipeline
// as an admin upload, so no community shows up without a picture.
async function createCommunity(seed: SeedCommunity): Promise<void> {
	const color = hexColor(seed.color);
	const communityId = await generateCommunityId();
	const icons = await uploadIcons({ icon: renderIcon(seed.letter, color), communityId });
	const headers = await uploadHeaders({
		ctr_header: renderBanner(seed.letter, color, 400, 220),
		wup_header: renderBanner(seed.letter, color, 1280, 180),
		communityId
	});
	if (icons === null || headers === null) {
		throw new Error(`Could not upload the artwork for ${seed.name}`);
	}
	const fields: Partial<SeedCommunity> = { ...seed };
	delete fields.letter;
	delete fields.color;
	const base = fields as Omit<SeedCommunity, 'letter' | 'color'>;
	await Community.create({
		...base,
		created_at: new Date(),
		empathy_count: 0,
		has_shop_page: 0,
		icon: icons.tgaBlob,
		ctr_header: headers.ctr,
		wup_header: headers.wup,
		icon_paths: {
			32: icons.icon32,
			48: icons.icon48,
			64: icons.icon64,
			96: icons.icon96,
			128: icons.icon128
		},
		community_id: communityId,
		// 64-bit with the top bit set, as tryCreateCommunity does (some games prefer it)
		olive_community_id: (crypto.randomBytes(8).readBigUInt64BE(0) | (1n << 63n)).toString(),
		is_recommended: 0
	});
}

const created = await ensureSeedCommunities({
	existsByName: async name => Community.exists({ name }),
	existsForTitleId: async id => Community.exists({ title_id: { has: id } }),
	create: createCommunity
}, buildSeedCommunities());
for (const name of created) {
	console.log(`community ${name}: created`);
}
if (created.length === 0) {
	console.log('communities: all present, left alone');
}

await getDb().$disconnect();
