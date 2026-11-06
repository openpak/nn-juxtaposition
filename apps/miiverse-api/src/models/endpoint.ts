import { getDb } from '@/database';
import type { Endpoint as EndpointRow } from '@/prisma/client';

/* Discovery data, the table `endpoints` (the Mongo `endpoints` collection), one row per server
 * access level. */

export type Endpoint = EndpointRow;
export type HydratedEndpointDocument = EndpointRow;
export type EndpointInput = Omit<EndpointRow, 'id' | 'legacy_mongo_id'>;

export const Endpoint = {
	async findAll(): Promise<EndpointRow[]> {
		return getDb().endpoint.findMany({ orderBy: { id: 'asc' } });
	},

	async findByAccessLevel(serverAccessLevel: string): Promise<EndpointRow | null> {
		return getDb().endpoint.findUnique({ where: { server_access_level: serverAccessLevel } });
	},

	async create(input: EndpointInput): Promise<EndpointRow> {
		return getDb().endpoint.create({ data: input });
	}
};
