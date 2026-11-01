import { Post } from '@/models/post';
import { bulkDeleteCDNAsset } from '@/util';
import { listPostMediaKeys, postIdOfMediaKey } from '@/services/cdn/media';

export type OrphanReport = { scanned: number; live: number; orphans: string[]; deleted: number; foreign: number };

/**
 * Finds screenshot and drawing objects whose post is gone or removed and (unless dryRun) deletes
 * them. Idempotent: a second run finds nothing. A post is live when a row with that id exists and
 * is not removed.
 */
export async function cleanOrphanMedia(opts: { dryRun: boolean }): Promise<OrphanReport> {
	const keys = await listPostMediaKeys();
	const owners = new Map<string, string[]>();
	let foreign = 0;
	for (const key of keys) {
		const owner = postIdOfMediaKey(key);
		if (!owner) {
			foreign++;
			continue;
		}
		owners.set(owner.id, [...(owners.get(owner.id) ?? []), key]);
	}

	const ids = [...owners.keys()];
	const liveIds = new Set<string>();
	for (let i = 0; i < ids.length; i += 500) {
		const rows = await Post.find({ id: { $in: ids.slice(i, i + 500) }, removed: false }, { id: 1 }).lean();
		for (const row of rows) {
			liveIds.add(row.id);
		}
	}

	const orphans = [...owners.entries()].filter(([id]) => !liveIds.has(id)).flatMap(([, ks]) => ks);
	let deleted = 0;
	if (!opts.dryRun) {
		for (let i = 0; i < orphans.length; i += 500) {
			const batch = orphans.slice(i, i + 500);
			if (await bulkDeleteCDNAsset(batch)) {
				deleted += batch.length;
			}
		}
	}
	return { scanned: keys.length, live: keys.length - foreign - orphans.length, orphans, deleted, foreign };
}
