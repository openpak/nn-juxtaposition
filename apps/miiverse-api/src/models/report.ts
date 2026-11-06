import type { Report as ReportRow } from '@/prisma/client';

/* Post reports, the table `reports` (the Mongo `reports` collection). Queried with getDb().report. */

export type IReport = ReportRow;
export type HydratedReportDocument = ReportRow;
