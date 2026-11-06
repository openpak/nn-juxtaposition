import '@/extend-zod'; // Needs to be the first import
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, setupPrisma } from '@/database';
import { Community } from '@/models/community';
import { artHash, communityIdForKey, describeGame, planUpdate } from '@/services/communities/game-communities';
import { hexColor, iconLetter, renderBanner, renderIcon } from '@/services/communities/seed-images';
import { initImageProcessing, uploadHeaders, uploadIcons } from '@/images';
import { generateCommunityId } from '@/services/internal/utils/communities';
import { OFFICIAL_PID } from '@/services/web-identity/web-identity';
import { setupS3 } from '@/s3';
import type { GameEntry } from '@/services/communities/game-communities';
import type { HydratedCommunityDocument, IIconPaths } from '@/types/models/community';

/* Creates and updates one community per game from a bundle built by tools/game-communities/build.py.
 *
 *   node dist/game-communities.js <bundle dir>
 *
 * Idempotent and never deletes: a game's community is found by its fixed id, then by a shared title
 * ID, then by name; what is missing is created (owned by the official account), what exists gets
 * its name, title IDs and art brought up to date. Art is the game's tile from the bundle, or the
 * OpenVerse letter icon when it has none. */

const dir = process.argv[2];
if (!dir) {
	throw new Error('usage: game-communities <bundle dir>');
}
const bundle = JSON.parse(readFileSync(path.join(dir, 'games.json'), 'utf8')) as { games: GameEntry[] };

await setupPrisma();
setupS3();
await initImageProcessing();

type Art = { icons: NonNullable<Awaited<ReturnType<typeof uploadIcons>>>; headers: NonNullable<Awaited<ReturnType<typeof uploadHeaders>>>; sha: string };

async function drawArt(game: GameEntry, communityId: string, icon: Buffer | null): Promise<Art> {
	const letter = iconLetter(game.name);
	const color = hexColor(game.color);
	const icons = await uploadIcons({ icon: icon ?? renderIcon(letter, color), communityId });
	const headers = await uploadHeaders({
		ctr_header: renderBanner(letter, color, 400, 220),
		wup_header: renderBanner(letter, color, 1280, 180),
		communityId
	});
	if (icons === null || headers === null) {
		throw new Error(`Could not upload the artwork for ${game.name}`);
	}
	return { icons, headers, sha: artHash(icon, game.color, letter) };
}

function artFields(art: Art): { icon: string; ctr_header: string; wup_header: string; icon_paths: IIconPaths } {
	return {
		icon: art.icons.tgaBlob,
		ctr_header: art.headers.ctr,
		wup_header: art.headers.wup,
		icon_paths: { 32: art.icons.icon32, 48: art.icons.icon48, 64: art.icons.icon64, 96: art.icons.icon96, 128: art.icons.icon128 }
	};
}

async function find(game: GameEntry): Promise<HydratedCommunityDocument | null> {
	const byId = await Community.findOne({ olive_community_id: communityIdForKey(game.key) });
	if (byId) {
		return byId;
	}
	if (game.title_ids.length > 0) {
		const byTitle = await Community.findOne({ title_id: { hasSome: game.title_ids } });
		if (byTitle) {
			return byTitle;
		}
	}
	return Community.findOne({ name: { equals: game.name, mode: 'insensitive' }, type: { not: 1 } }); // 1 = a family page, never a game
}

const counts = { created: 0, updated: 0, current: 0 };
for (const game of bundle.games) {
	const icon = game.icon ? readFileSync(path.join(dir, game.icon)) : null;
	const sha = artHash(icon, game.color, iconLetter(game.name));
	const existing = await find(game);

	if (!existing) {
		const communityId = await generateCommunityId();
		const art = await drawArt(game, communityId, icon);
		await Community.create({
			platform_id: game.platform_id,
			name: game.name,
			description: describeGame(game),
			open: true,
			allows_comments: true,
			type: 0,
			parent: null,
			owner: OFFICIAL_PID,
			created_at: new Date(),
			empathy_count: 0,
			has_shop_page: 0,
			...artFields(art),
			title_id: game.title_ids,
			community_id: communityId,
			olive_community_id: communityIdForKey(game.key),
			is_recommended: 0,
			app_data: '',
			permissions: { open: true, minimum_new_post_access_level: 0, minimum_new_comment_access_level: 0, minimum_new_community_access_level: 3 },
			art_sha: art.sha // the sync's own bookmark
		});
		counts.created++;
		console.log(`community ${game.name}: created`);
		continue;
	}

	const update = planUpdate({
		olive_community_id: existing.olive_community_id,
		name: existing.name,
		description: existing.description,
		title_id: existing.title_id,
		art_sha: existing.art_sha ?? undefined
	}, game, sha);
	if (!update) {
		counts.current++;
		continue;
	}
	const set: Parameters<typeof Community.updateOne>[1] = {};
	if (update.name !== undefined) {
		set.name = update.name;
	}
	if (update.description !== undefined) {
		set.description = update.description;
	}
	if (update.title_id !== undefined) {
		set.title_id = update.title_id;
	}
	if (update.art) {
		const art = await drawArt(game, existing.community_id, icon);
		Object.assign(set, artFields(art), { art_sha: art.sha });
	}
	await Community.updateOne({ olive_community_id: existing.olive_community_id }, set);
	counts.updated++;
	console.log(`community ${game.name}: updated (${Object.keys(set).filter(k => k !== 'icon' && k !== 'icon_paths' && k !== 'ctr_header' && k !== 'wup_header').join(', ')})`);
}

console.log(`game communities: ${counts.created} created, ${counts.updated} updated, ${counts.current} already current, ${bundle.games.length} games`);
await getDb().$disconnect();
