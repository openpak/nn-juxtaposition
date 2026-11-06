import { z } from 'zod';
import { createInternalApiRouter } from '@/services/internal/builder/router';
import { guards } from '@/services/internal/middleware/guards';
import { deleteOptional } from '@/services/internal/utils';
import { standardSortSchema, standardSortToDirection } from '@/services/internal/contract/utils';
import { mapPage, pageControlSchema, pageDtoSchema } from '@/services/internal/contract/page';
import { automodRuleSchema, mapAutomodRule } from '@/services/internal/contract/admin/automodRule';
import { automodRuleMode, automodRuleType } from '@/models/automodRules';
import { errors } from '@/services/internal/errors';
import { mapResult, resultSchema } from '@/services/internal/contract/result';
import { automodLogSchema, mapAutomodLog } from '@/services/internal/contract/admin/automodLog';
import { automodAction } from '@/models/automodLog';
import type { Prisma } from '@/prisma/client';

export const adminAutomodRouter = createInternalApiRouter();

adminAutomodRouter.get({
	path: '/admin/automod-rules',
	name: 'admin.automodRules.list',
	guard: guards.moderator,
	schema: {
		query: z.object({
			enabled: z.stringbool().optional(),
			sort: standardSortSchema
		}).extend(pageControlSchema(50)),
		response: pageDtoSchema(automodRuleSchema)
	},
	async handler({ query, db }) {
		const dbQuery: Prisma.AutomodRuleWhereInput = deleteOptional({
			enabled: query.enabled
		});
		const rules = await db.automodRule.findMany({
			where: dbQuery,
			orderBy: { created_at: standardSortToDirection(query.sort) },
			skip: query.offset,
			take: query.limit
		});
		const total = await db.automodRule.count({ where: dbQuery });

		return mapPage(total, rules.map(v => mapAutomodRule(v)));
	}
});

adminAutomodRouter.post({
	path: '/admin/automod-rules',
	name: 'admin.automodRules.create',
	description: 'Create a initial start of a rule, use the update endpoint for the rest of the fields',
	guard: guards.developer,
	schema: {
		body: z.object({
			title: z.string(),
			type: z.enum(automodRuleType),
			mode: z.enum(automodRuleMode)
		}),
		response: automodRuleSchema
	},
	async handler({ body, db }) {
		const rule = await db.automodRule.create({
			data: {
				title: body.title,
				enabled: false,
				created_at: new Date(),
				type: body.type,
				mode: body.mode
			}
		});

		return mapAutomodRule(rule);
	}
});

adminAutomodRouter.patch({
	path: '/admin/automod-rules/:id',
	name: 'admin.automodRules.update',
	guard: guards.developer,
	schema: {
		params: z.object({
			id: z.string()
		}),
		body: z.object({
			title: z.string().trim().min(1),
			description: z.string().trim().nullable(),
			enabled: z.boolean(),
			type: z.enum(automodRuleType),
			mode: z.enum(automodRuleMode),
			settings: z.object({
				keyword: z.object({
					keywords: z.array(z.string().min(1))
				}).optional()
			})
		}).partial(),
		response: automodRuleSchema
	},
	async handler({ params, body, db }) {
		const desc = body.description ?? '';
		const updated = await db.automodRule.updateMany({
			where: { id: params.id },
			data: deleteOptional({
				title: body.title,
				description: desc.length > 0 ? desc : null,
				enabled: body.enabled,
				type: body.type,
				mode: body.mode,
				keywords: body.settings?.keyword?.keywords
			})
		});
		const rule = updated.count > 0 ? await db.automodRule.findUnique({ where: { id: params.id } }) : null;

		if (!rule) {
			throw errors.for('not_found');
		}

		return mapAutomodRule(rule);
	}
});

adminAutomodRouter.delete({
	path: '/admin/automod-rules/:id',
	name: 'admin.automodRules.delete',
	guard: guards.developer,
	schema: {
		params: z.object({
			id: z.string()
		}),
		response: resultSchema
	},
	async handler({ params, db }) {
		const deleted = await db.automodRule.deleteMany({ where: { id: params.id } });
		if (deleted.count === 0) {
			throw errors.for('not_found');
		}

		return mapResult('success');
	}
});

adminAutomodRouter.get({
	path: '/admin/automod-logs',
	name: 'admin.automodLogs.list',
	guard: guards.moderator,
	schema: {
		query: z.object({
			action: z.enum(automodAction).optional(),
			authorPid: z.coerce.number().optional(),
			sort: standardSortSchema
		}).extend(pageControlSchema(150)),
		response: pageDtoSchema(automodLogSchema)
	},
	async handler({ query, db }) {
		const dbQuery: Prisma.AutomodLogWhereInput = deleteOptional({
			action: query.action,
			author: query.authorPid
		});
		const logs = await db.automodLog.findMany({
			where: dbQuery,
			orderBy: { created_at: standardSortToDirection(query.sort) },
			skip: query.offset,
			take: query.limit
		});
		const total = await db.automodLog.count({ where: dbQuery });

		const ruleIds = logs.map(v => v.rule_id);
		const rules = await db.automodRule.findMany({
			where: {
				id: {
					in: ruleIds
				}
			}
		});

		const userIds = logs.map(v => v.author).filter(v => !!v);
		const users = await db.user.findMany({
			where: {
				pid: {
					in: userIds
				}
			}
		});

		const mappedLogs = logs.map((log) => {
			const rule = rules.find(v => v.id === log.rule_id) ?? null;
			const user = users.find(v => v.pid === log.author) ?? null;

			return mapAutomodLog(log, user, rule);
		});
		return mapPage(total, mappedLogs);
	}
});
