import { logger } from '@/logger';
import { Post } from '@/models/post';
import { bulkDeleteCDNAsset } from '@/util';
import { postMediaKeys } from '@/services/cdn/media';
import type { DeleteAccountDataRequest, DeleteAccountDataResponse } from '@pretendonetwork/grpc/miiverse/v2/delete_account_data_rpc';

const pageLimit = 50;

export async function deleteAccountData(req: DeleteAccountDataRequest): Promise<DeleteAccountDataResponse> {
	logger.info(`Deleting account ${req.pid}...`);
	let totalCdnDeletions = 0;
	let totalDeleted = 0;
	let hasMoreToDelete = true;
	while (hasMoreToDelete) {
		const posts = await Post.findRows({
			pid: req.pid
		}, { take: pageLimit });

		const cdnKeys = posts.flatMap(msg => postMediaKeys(msg));
		await bulkDeleteCDNAsset(cdnKeys); // ignore return value, continue on error
		totalCdnDeletions += cdnKeys.length;

		await Post.deleteMany({
			id: {
				in: posts.map(v => v.id)
			}
		});

		totalDeleted += posts.length;
		hasMoreToDelete = posts.length !== 0;
	}

	logger.info(`Deleted account ${req.pid} (${totalDeleted} posts, ${totalCdnDeletions} CDN files)`);
	return {
		hasDeleted: totalDeleted > 0,
		postsDeleted: totalDeleted
	};
}
