import { describe, expect, it } from 'vitest';
import { buildEndpointSeeds } from '@/services/discovery/endpoints';

const domains = { api: 'api.olv.example', discovery: 'discovery.olv.example', portal: 'portal.olv.example', ctr: 'ctr.olv.example' };

describe('buildEndpointSeeds', () => {
	const seeds = buildEndpointSeeds(domains);

	it('has one document per access level', () => {
		expect(seeds.map(s => s.server_access_level)).toEqual(['prod', 'test', 'dev']);
	});

	it('maps the configured hosts', () => {
		for (const s of seeds) {
			expect(s).toMatchObject({ host: 'discovery.olv.example', api_host: 'api.olv.example', portal_host: 'portal.olv.example', n3ds_host: 'ctr.olv.example', status: 0 });
		}
	});

	it('opens guests and sign-ups only on prod', () => {
		expect(seeds[0]).toMatchObject({ guest_access: true, new_users: true });
		expect(seeds[1]).toMatchObject({ guest_access: false, new_users: false });
	});
});
