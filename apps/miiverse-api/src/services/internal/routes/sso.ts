import { z } from 'zod';
import { guards } from '@/services/internal/middleware/guards';
import { createInternalApiRouter } from '@/services/internal/builder/router';
import { errors } from '@/services/internal/errors';
import { mapResult, resultSchema } from '@/services/internal/contract/result';
import { acceptRules, resolveWebIdentity } from '@/services/web-identity/web-identity';

export const ssoRouter = createInternalApiRouter();

const resolvedSchema = z.object({
	pid: z.number(),
	linked: z.boolean(),
	rulesAccepted: z.boolean()
}).openapi('SsoIdentity');

// Called by the web UI right after openpak.org sign-in. Creates the OpenVerse user on first use, so
// there is no first-run page for web sign-ins. Like every internal route it is only reachable
// through the API-key-protected gRPC channel.
ssoRouter.post({
	path: '/sso/resolve',
	name: 'sso.resolve',
	description: 'Find or create the OpenVerse user for an OpenPak account',
	guard: guards.guest,
	schema: {
		body: z.object({
			accountId: z.string().min(1).max(64),
			displayName: z.string().max(200),
			wiiuPid: z.number().int().nullable()
		}),
		response: resolvedSchema
	},
	async handler({ body, db }) {
		return await resolveWebIdentity(db as never, body);
	}
});

ssoRouter.post({
	path: '/sso/accept-rules',
	name: 'sso.acceptRules',
	description: 'Record that the signed-in web account accepted the community rules',
	guard: guards.guest,
	schema: {
		response: resultSchema
	},
	async handler({ auth, db }) {
		if (!auth) {
			throw errors.for('requires_auth');
		}
		const ok = await acceptRules(db as never, auth.pnid.pid);
		if (!ok) {
			throw errors.for('not_found');
		}
		return mapResult('success');
	}
});
