import '@/extend-zod'; // Needs to be the first import
import { getDb, setupPrisma } from '@/database';
import { setupS3 } from '@/s3';
import { cleanOrphanMedia } from '@/services/cdn/orphans';

// One-off, idempotent: deletes screenshot and drawing objects that no live post owns.
// Dry run unless `--apply` is given:  node dist/media-orphans.js [--apply]
const apply = process.argv.includes('--apply');
await setupPrisma();
setupS3();
const report = await cleanOrphanMedia({ dryRun: !apply });
console.log(JSON.stringify({
	mode: apply ? 'apply' : 'dry-run',
	scanned: report.scanned,
	live: report.live,
	foreign: report.foreign,
	orphans: report.orphans.length,
	deleted: report.deleted
}));
for (const key of report.orphans) {
	console.log(`${apply ? 'deleted' : 'orphan'} ${key}`);
}
await getDb().$disconnect();
