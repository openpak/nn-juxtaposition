import type { AuditLog as AuditLogRow, AuditLogAction } from '@/prisma/client';

/* Moderation audit log, the table `audit_logs` (the Mongo `logs` collection). Queried with
 * getDb().auditLog. */

export const logEntryActions = [
	'REMOVE_POST',
	'IGNORE_REPORT',
	'LIMIT_POSTING',
	'TEMP_BAN',
	'PERMA_BAN',
	'UNBAN',
	'UPDATE_USER',
	'MAKE_COMMUNITY',
	'UPDATE_COMMUNITY',
	'DELETE_COMMUNITY'
] as const satisfies readonly AuditLogAction[];
export type LogEntryActions = AuditLogAction;

export type AuditLog = AuditLogRow;
export type HydratedAuditLogDocument = AuditLogRow;
