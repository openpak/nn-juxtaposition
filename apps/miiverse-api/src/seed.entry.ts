import '@/extend-zod'; // Needs to be the first import
import mongoose from 'mongoose';
import { config } from '@/config';
import { Endpoint } from '@/models/endpoint';
import { buildEndpointSeeds } from '@/services/discovery/endpoints';
import { ensureTitleCommunities } from '@/services/communities/title-communities';
import { Community, tryCreateCommunity } from '@/models/community';

// Idempotent: creates the missing endpoint documents and leaves existing ones
// (and any hand edits to them) alone.
await mongoose.connect(config.mongoose.uri);

for (const seed of buildEndpointSeeds(config.domains)) {
	const existing = await Endpoint.findOne({ server_access_level: seed.server_access_level });
	if (existing) {
		console.log(`endpoint ${seed.server_access_level}: exists, left alone`);
		continue;
	}
	await Endpoint.create(seed);
	console.log(`endpoint ${seed.server_access_level}: created`);
}

// Game communities a console cannot post without (title ID -> community).
const createdCommunities = await ensureTitleCommunities({
	existsForTitleId: async id => (await Community.exists({ title_id: id })) !== null,
	create: async seed => { await tryCreateCommunity(seed); }
});
for (const name of createdCommunities) {
	console.log(`community ${name}: created`);
}

await mongoose.disconnect();
