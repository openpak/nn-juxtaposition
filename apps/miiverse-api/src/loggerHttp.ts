import { pinoHttp } from 'pino-http';
import { logger } from '@/logger';
import { config } from '@/config';
import { decodeParamPack } from '@/util';
import { ApiErrorCode } from '@/errors';
import type { SerializedRequest, SerializedResponse } from 'pino';
import type { Request } from 'express';
import type { ParamPack } from '@/types/common/param-pack';

type SerializedNintendoRequest = SerializedRequest & { param_pack?: ParamPack };
type SerializedMiiverseResponse = SerializedResponse & { errorCode?: ApiErrorCode; errorCodeStr?: string };

// A URL or Referer carries query strings (tokens, search terms): keep the path only.
function pathOnly(url: string): string {
	return url.split('?')[0].split('#')[0];
}

// Without sensitive logging a request line is method, path (never the query), id and client address.
// No headers, and so no decoded X-Nintendo-ParamPack (device identifiers), are ever written.
export function serializeReq(req: SerializedNintendoRequest): SerializedNintendoRequest {
	const raw = req.raw as Request;

	if (config.log.sensitive) {
		const paramPack = raw.headers['x-nintendo-parampack'];
		if (typeof paramPack === 'string') {
			req.param_pack = decodeParamPack(paramPack);
		}
		req.remoteAddress = raw.ip ?? req.remoteAddress;
		return req;
	}

	return {
		id: req.id,
		method: req.method,
		url: pathOnly(req.url),
		headers: {},
		remoteAddress: raw.ip ?? req.remoteAddress,
		remotePort: req.remotePort
	} as SerializedNintendoRequest;
}

export const loggerHttp = pinoHttp({
	logger: logger,
	serializers: {
		req(req: SerializedNintendoRequest) {
			return serializeReq(req);
		},
		res(res: SerializedMiiverseResponse) {
			// No headers unless sensitive logging is on (owner rule: never log headers)
			res.headers = config.log.sensitive ? Object.assign({}, res.headers) : {};

			if ('errorCode' in res.raw) {
				res.errorCode = res.raw.errorCode as ApiErrorCode;
				res.errorCodeStr = ApiErrorCode[res.errorCode];
			}

			return res;
		}
	}
});
