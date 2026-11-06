import type { AutomodRule as AutomodRuleRow, AutomodRuleMode, AutomodRuleType } from '@/prisma/client';

/* Automod rules, the table `automod_rules` (the Mongo `automodrules` collection). Queried with
 * getDb().automodRule. The Mongo documents kept a keyword rule's words in `keyword_settings.keywords`;
 * the row has them in `keywords`, and automodRuleKeywordSettings() gives the old object back. */

export const automodRuleType = ['keyword'] as const satisfies readonly AutomodRuleType[];
export type { AutomodRuleType, AutomodRuleMode };

export const automodRuleMode = ['block', 'log'] as const satisfies readonly AutomodRuleMode[];

export type AutomodRule = AutomodRuleRow;
export type HydratedAutomodRuleDocument = AutomodRuleRow;

/** The settings object of a keyword rule, or null for another rule type */
export function automodRuleKeywordSettings(rule: AutomodRuleRow): { keywords: string[] } | null {
	return rule.type === 'keyword' ? { keywords: rule.keywords } : null;
}
