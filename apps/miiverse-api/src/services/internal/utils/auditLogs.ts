import { getDb } from '@/database';
import type { LogEntryActions } from '@/models/logs';

export const accountActionDisplayMap: Record<number, LogEntryActions> = {
	0: 'UNBAN',
	1: 'LIMIT_POSTING',
	2: 'TEMP_BAN',
	3: 'PERMA_BAN'
};

export type CreateLogEntryOptions = {
	action: LogEntryActions;
	actorId: number;
	targetResourceId: string;
	context: string; // Description of the changes
	fields?: string[]; // What fields have been changed?
};

export async function createLogEntry(ops: CreateLogEntryOptions): Promise<void> {
	await getDb().auditLog.create({
		data: {
			actor: ops.actorId,
			action: ops.action,
			target: ops.targetResourceId,
			context: ops.context,
			changed_fields: ops.fields ?? []
		}
	});
}
