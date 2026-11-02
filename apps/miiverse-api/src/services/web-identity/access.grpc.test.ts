import '@/extend-zod'; // Needs to be the first import
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createChannel, createClient, createServer } from 'nice-grpc';
import { lookupVia, parentalDefinition } from '@/services/web-identity/access';
import { webAccessFor } from '@/services/web-identity/parental';

vi.hoisted(() => {
	process.env.SKIP_CONFIG_VALIDATION = 'true';
});

/* The real call path through nice-grpc against an in-process stand-in for the parental core.
 * A bare-string request used to throw a TypeError here, which failed closed for EVERY account,
 * adults nobody supervises included. */
describe('parental lookup over gRPC', () => {
	const supervisedIds = new Map<string, string>([['child-1', 'read']]);
	const seenKeys: string[] = [];
	const server = createServer();
	let address = '';

	beforeAll(async () => {
		server.add(parentalDefinition as never, {
			getProfile: async (req: { memberId: string }, ctx: { metadata: { get(k: string): string | undefined } }) => {
				seenKeys.push(ctx.metadata.get('x-internal-key') ?? '');
				const level = supervisedIds.get(req.memberId);
				return level ? { supervised: true, openverse: level } : { supervised: false, openverse: 'read_post' };
			}
		} as never);
		const port = await server.listen('127.0.0.1:0');
		address = `127.0.0.1:${port}`;
	});
	afterAll(async () => {
		await server.shutdown();
	});

	const lookup = (): ReturnType<typeof lookupVia> => lookupVia(createClient(parentalDefinition as never, createChannel(address)) as never, 'k');

	it('an account nobody supervises gets full access', async () => {
		expect(await webAccessFor('adult-1', lookup())).toBe('full');
		expect(seenKeys.at(-1)).toBe('k');
	});

	it('a supervised account follows its level', async () => {
		expect(await webAccessFor('child-1', lookup())).toBe('read_only');
		supervisedIds.set('child-2', 'read_post');
		supervisedIds.set('child-3', 'off');
		expect(await webAccessFor('child-2', lookup())).toBe('full');
		expect(await webAccessFor('child-3', lookup())).toBe('none');
	});
});
