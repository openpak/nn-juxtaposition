// The discovery endpoint documents, one per server access level. A console's
// access level (from its account) picks which hosts and which switches it
// gets; an access level with no document cannot use Miiverse at all, so a
// fresh database has to be seeded (`npm run db:seed`).
export type EndpointSeed = {
	status: number;
	server_access_level: string;
	topics: boolean;
	guest_access: boolean;
	new_users: boolean;
	host: string;
	api_host: string;
	portal_host: string;
	n3ds_host: string;
};

export type SeedDomains = {
	api: string;
	discovery: string;
	portal: string;
	ctr: string;
};

/**
 * prod: everyone. test and dev: the same hosts by default (an operator points
 * them at a staging instance by changing the document), with guests and new
 * sign-ups closed so only invited accounts reach them.
 */
export function buildEndpointSeeds(domains: SeedDomains): EndpointSeed[] {
	const hosts = {
		host: domains.discovery,
		api_host: domains.api,
		portal_host: domains.portal,
		n3ds_host: domains.ctr
	};
	return [
		{ status: 0, server_access_level: 'prod', topics: true, guest_access: true, new_users: true, ...hosts },
		{ status: 0, server_access_level: 'test', topics: true, guest_access: false, new_users: false, ...hosts },
		{ status: 0, server_access_level: 'dev', topics: true, guest_access: false, new_users: false, ...hosts }
	];
}
