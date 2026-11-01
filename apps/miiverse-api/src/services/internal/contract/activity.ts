import { z } from 'zod';
import { CATEGORY_IDS } from '@/services/activity/activity';
import type { PostRow } from '@/services/activity/activity';

export const activityCategorySchema = z.enum(CATEGORY_IDS).openapi('ActivityCategory');

export const activitySettingsSchema = z.object({
	enabled: z.boolean(),
	/** Only categories that have a source today. */
	categories: z.array(z.object({
		id: activityCategorySchema,
		enabled: z.boolean()
	}))
}).openapi('ActivitySettings');
export type ActivitySettingsDto = z.infer<typeof activitySettingsSchema>;

export const activityItemSchema = z.object({
	id: z.number(),
	pid: z.number(),
	name: z.string(),
	category: z.string(),
	subject: z.string(),
	link: z.string(),
	image: z.string(),
	/** A digest post: how many moments it holds. 1 otherwise. */
	count: z.number(),
	digest: z.boolean(),
	createdAt: z.string()
}).openapi('ActivityItem');
export type ActivityItemDto = z.infer<typeof activityItemSchema>;

export function mapActivityItem(row: PostRow, pid: number, name: string): ActivityItemDto {
	return {
		id: row.id,
		pid,
		name,
		category: row.category,
		subject: row.subject,
		link: row.link,
		image: row.image,
		count: row.count,
		digest: row.digest,
		createdAt: row.createdAt.toISOString()
	};
}
