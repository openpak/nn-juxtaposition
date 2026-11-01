import { describe, expect, it } from 'vitest';
import { CONSOLE_SHARE_ROOM, switchTitleIdForms } from '@/services/console-share/console-share';
import { buildSeedCommunities } from '@/services/communities/seed-communities';

describe('console shares', () => {
	it('matches a Switch title id in hex and in the decimal form communities use', () => {
		expect(switchTitleIdForms('0100F2C0115B6000')).toEqual(['0100F2C0115B6000', '0100f2c0115b6000', '72324500776771584']);
	});

	it('has no forms for a missing or malformed title id', () => {
		expect(switchTitleIdForms('')).toEqual([]);
		expect(switchTitleIdForms('0100f2c0115b6000')).toEqual([]);
		expect(switchTitleIdForms('0100F2C0115B60')).toEqual([]);
	});

	it('falls back to a room the seed creates', () => {
		expect(buildSeedCommunities().some(c => c.name === CONSOLE_SHARE_ROOM && !c.title_id)).toBe(true);
	});
});
