import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = path.resolve(__dirname, 'assets/locales');

function flatten(value: unknown, key: string, out: [string, string][]): void {
	if (typeof value === 'string') {
		out.push([key, value]);
	} else if (value && typeof value === 'object') {
		for (const [k, v] of Object.entries(value)) {
			flatten(v, key ? `${key}.${k}` : k, out);
		}
	}
}

// CJK languages attach particles directly (OpenVerseは, OpenVerse를); that is correct there.
const CJK_FREE_LETTER = /Open(?:Verse|Pak)(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])\p{L}/u;

const locales = readdirSync(dir)
	.filter(f => f.endsWith('.json'))
	.map((f) => {
		const out: [string, string][] = [];
		flatten(JSON.parse(readFileSync(path.join(dir, f), 'utf8')), '', out);
		return { file: f, values: out };
	});

describe('locale files', () => {
	it('never attach letters to the brand name (OpenVerse[a-z], OpenPak[a-z])', () => {
		const bad = locales.flatMap(l => l.values.filter(([, v]) => CJK_FREE_LETTER.test(v)).map(([k]) => `${l.file}:${k}`));
		expect(bad).toEqual([]);
	});

	it('only the AGPL credit lines mention Juxtaposition', () => {
		const bad = locales.flatMap(l => l.values
			.filter(([k, v]) => /juxt/i.test(v) && !/(^|\.)(fine_print|credit)$/.test(k))
			.map(([k]) => `${l.file}:${k}`));
		expect(bad).toEqual([]);
	});
});
