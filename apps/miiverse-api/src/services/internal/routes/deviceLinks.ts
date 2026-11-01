import { z } from 'zod';
import { guards } from '@/services/internal/middleware/guards';
import { createInternalApiRouter } from '@/services/internal/builder/router';
import { errors } from '@/services/internal/errors';
import { mapResult, resultSchema } from '@/services/internal/contract/result';
import { createDeviceLink, DEVICE_CLASSES, listDeviceLinks, resolveDeviceToken, revokeDeviceLink } from '@/services/device-link/device-link';

export const deviceLinksRouter = createInternalApiRouter();

const classSchema = z.enum(DEVICE_CLASSES);

const linkSchema = z.object({
	id: z.string(),
	deviceClass: z.string(),
	label: z.string(),
	createdAt: z.date(),
	lastUsedAt: z.date().nullable()
}).openapi('DeviceLink');

// Like /sso/*, these are called by the web UI only (the internal API is reachable through the
// API-key-protected gRPC channel alone), which has already checked who the account is.

deviceLinksRouter.post({
	path: '/device-links',
	name: 'deviceLinks.create',
	description: 'Mint a device token for an approved link code',
	guard: guards.guest,
	schema: {
		body: z.object({ accountId: z.string().min(1).max(64), deviceClass: classSchema }),
		response: z.object({ id: z.string(), token: z.string(), deviceClass: classSchema, label: z.string() }).openapi('DeviceLinkCreated')
	},
	async handler({ body, db }) {
		const created = await createDeviceLink(db as never, body);
		if (!created) {
			throw errors.for('forbidden', 'too_many_links');
		}
		return created;
	}
});

deviceLinksRouter.post({
	path: '/device-links/resolve',
	name: 'deviceLinks.resolve',
	description: 'Resolve a device token to its account',
	guard: guards.guest,
	schema: {
		body: z.object({ token: z.string().min(1).max(200) }),
		response: z.object({
			id: z.string(),
			accountId: z.string(),
			pid: z.number().nullable(),
			deviceClass: classSchema
		}).nullable().openapi('DeviceLinkResolved')
	},
	async handler({ body, db }) {
		return await resolveDeviceToken(db as never, body.token);
	}
});

deviceLinksRouter.post({
	path: '/device-links/list',
	name: 'deviceLinks.list',
	description: 'Active device links of an account',
	guard: guards.guest,
	schema: {
		body: z.object({ accountId: z.string().min(1).max(64) }),
		response: z.object({ items: z.array(linkSchema) }).openapi('DeviceLinkList')
	},
	async handler({ body, db }) {
		return { items: await listDeviceLinks(db as never, body.accountId) };
	}
});

deviceLinksRouter.post({
	path: '/device-links/revoke',
	name: 'deviceLinks.revoke',
	description: 'Revoke one device link of an account',
	guard: guards.guest,
	schema: {
		body: z.object({ accountId: z.string().min(1).max(64), id: z.string().min(1).max(64) }),
		response: resultSchema
	},
	async handler({ body, db }) {
		const ok = await revokeDeviceLink(db as never, body.accountId, body.id);
		if (!ok) {
			throw errors.for('not_found');
		}
		return mapResult('success');
	}
});
