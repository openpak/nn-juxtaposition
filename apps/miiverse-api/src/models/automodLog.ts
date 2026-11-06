import type { AutomodLog as AutomodLogRow, AutomodAction } from '@/prisma/client';

/* Automod decisions, the table `automod_logs` (the Mongo `automodlogs` collection). Queried with
 * getDb().automodLog. `matches` is a jsonb list of { start, end } character ranges. */

export const automodAction = ['blocked', 'logged'] as const satisfies readonly AutomodAction[];
export type { AutomodAction };

export type AutomodLogMatch = {
	start: number;
	end: number;
};

export type AutomodLog = AutomodLogRow;
export type HydratedAutomodLogDocument = AutomodLogRow;

export function automodLogMatches(log: AutomodLogRow): AutomodLogMatch[] {
	return Array.isArray(log.matches) ? log.matches as AutomodLogMatch[] : [];
}
