import express from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '@/config';
import { getS3 } from '@/s3';
import { cacheControlFor, contentTypeFor, toCdnKey } from '@/services/cdn/keys';
import type { Readable } from 'node:stream';

// Public, read-only media route: drawings, screenshots, community icons and
// headers straight from the object store (OpenPak: MinIO, bucket `miiverse`).
// It lives on the API host so consoles reach it over the same trusted TLS
// name as the rest of Miiverse; set PN_MIIVERSE_API_CDN_URL to
// https://<api host>/cdn.
const router = express.Router();

router.get(/^\/cdn\/(.+)$/, async (request, response) => {
	const key = toCdnKey(request.params[0] as unknown as string);
	if (key === null) {
		response.sendStatus(404);
		return;
	}

	try {
		const object = await getS3().send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
		response.status(200);
		response.setHeader('Content-Type', contentTypeFor(key));
		if (object.ContentLength !== undefined) {
			response.setHeader('Content-Length', String(object.ContentLength));
		}
		// Post media must stop loading once its post is deleted, so it is not cached blindly.
		response.setHeader('Cache-Control', cacheControlFor(key));
		(object.Body as Readable).pipe(response);
	} catch (error) {
		const name = (error as { name?: string }).name;
		if (name === 'NoSuchKey' || name === 'NotFound') {
			response.sendStatus(404);
			return;
		}
		request.log.error(error, 'CDN read failed');
		response.sendStatus(502);
	}
});

export const cdnRouter = router;
