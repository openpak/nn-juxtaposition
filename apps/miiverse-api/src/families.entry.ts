import '@/extend-zod'; // Needs to be the first import
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { config } from '@/config';
import { Community } from '@/models/community';
import { checkFamilies, describeFamily, familyIdForSlug } from '@/services/communities/game-communities';
import { generateCommunityId } from '@/services/internal/utils/communities';
import { OFFICIAL_PID } from '@/services/web-identity/web-identity';
import type { FamilyEntry } from '@/services/communities/game-communities';

/* Gathers the game communities into franchise families for OpenVerse.
 *
 *   node dist/families.js <families.json> [--dry-run]    apply (idempotent)
 *   node dist/families.js --undo [--dry-run]             take every family apart again
 *
 * Apply: each family becomes a Sub community (id from its slug, art copied from its newest game)
 * and its games get `parent` = that id. Nothing else about a game changes, and nothing is deleted
 * except families the file no longer lists. The family documents carry `family: true`, which is how
 * --undo finds them: it unsets the games' parent and deletes the family documents. A mapping that
 * names a game no community has is refused before anything is written. */

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const undo = args.includes('--undo');
const file = args.find(a => !a.startsWith('--'));
if (!undo && !file) {
	throw new Error('usage: families <families.json> [--dry-run] | --undo [--dry-run]');
}

await mongoose.connect(config.mongoose.uri);
const col = Community.collection;
const say = (s: string): void => console.log(dry ? `[dry run] ${s}` : s);

async function takeApart(keep: Set<string>): Promise<number> {
	let removed = 0;
	for (const fam of await col.find({ family: true }).toArray()) {
		const id = fam.olive_community_id as string;
		if (keep.has(id)) {
			continue;
		}
		const n = await col.countDocuments({ parent: id });
		say(`family ${fam.name}: removed (${n} games set free)`);
		if (!dry) {
			await col.updateMany({ parent: id }, { $set: { parent: null } });
			await col.deleteOne({ olive_community_id: id, family: true });
		}
		removed++;
	}
	return removed;
}

if (undo) {
	const n = await takeApart(new Set());
	console.log(`families: ${n} removed`);
	await mongoose.disconnect();
	process.exit(0);
}

const families = (JSON.parse(readFileSync(file!, 'utf8')) as { families: FamilyEntry[] }).families;
const problems = checkFamilies(families);

type Doc = Record<string, any>;
const members = new Map<string, Doc[]>();
for (const f of families) {
	const docs: Doc[] = [];
	for (const name of f.games) {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const found = await col.find({ name: { $regex: `^${escaped}$`, $options: 'i' }, type: { $in: [0, 2] } }).toArray();
		if (found.length !== 1) {
			problems.push(`${f.slug}: "${name}" matches ${found.length} communities`);
			continue;
		}
		const taken = found[0]!.parent as string | null | undefined;
		if (taken && taken !== familyIdForSlug(f.slug)) {
			const other = await col.findOne({ olive_community_id: taken });
			if (!other?.family) {
				problems.push(`${f.slug}: "${name}" already has a parent that is not a family`);
				continue;
			}
		}
		docs.push(found[0]!);
	}
	members.set(f.slug, docs);
}
if (problems.length > 0) {
	console.error(`families.json cannot be applied:\n- ${problems.join('\n- ')}`);
	process.exit(1);
}

const keep = new Set(families.map(f => familyIdForSlug(f.slug)));
const counts = { created: 0, updated: 0, current: 0, games: 0 };
for (const f of families) {
	const id = familyIdForSlug(f.slug);
	const docs = members.get(f.slug)!;
	const art = docs[0]!; // newest game first
	const artFields = { icon: art.icon, ctr_header: art.ctr_header, wup_header: art.wup_header, icon_paths: art.icon_paths };
	const existing = await col.findOne({ olive_community_id: id });
	const description = describeFamily(f.name);
	if (!existing) {
		say(`family ${f.name}: created (${docs.length} games)`);
		if (!dry) {
			await col.insertOne({
				platform_id: 2, name: f.name, description, open: true, allows_comments: true,
				type: 1, parent: null, owner: OFFICIAL_PID, created_at: new Date(), empathy_count: 0, has_shop_page: 0,
				...artFields, title_id: [], community_id: await generateCommunityId(), olive_community_id: id,
				is_recommended: 0, app_data: '', family: true,
				permissions: { open: true, minimum_new_post_access_level: 0, minimum_new_comment_access_level: 0, minimum_new_community_access_level: 3 }
			});
		}
		counts.created++;
	} else {
		const changed = existing.name !== f.name || existing.description !== description || existing.type !== 1 || existing.parent ||
			JSON.stringify(existing.icon_paths) !== JSON.stringify(art.icon_paths) || existing.ctr_header !== art.ctr_header;
		if (changed) {
			say(`family ${f.name}: updated`);
			if (!dry) {
				await col.updateOne({ olive_community_id: id }, { $set: { name: f.name, description, type: 1, parent: null, family: true, ...artFields } });
			}
			counts.updated++;
		} else {
			counts.current++;
		}
	}
	for (const d of docs) {
		if (d.parent !== id) {
			counts.games++;
			if (!dry) {
				await col.updateOne({ olive_community_id: d.olive_community_id }, { $set: { parent: id } });
			}
		}
	}
}
// A game dropped from a family goes back to standing alone
for (const fam of await col.find({ family: true }).toArray()) {
	const id = fam.olive_community_id as string;
	const f = families.find(x => familyIdForSlug(x.slug) === id);
	const names = new Set((f?.games ?? []).map(g => g.toLowerCase()));
	for (const g of await col.find({ parent: id }).toArray()) {
		if (!names.has((g.name as string).toLowerCase())) {
			say(`game ${g.name}: leaves ${fam.name}`);
			if (!dry) {
				await col.updateOne({ olive_community_id: g.olive_community_id }, { $set: { parent: null } });
			}
		}
	}
}
const removed = await takeApart(keep);
console.log(`families: ${counts.created} created, ${counts.updated} updated, ${counts.current} already current, ${counts.games} games linked, ${removed} removed`);
await mongoose.disconnect();
