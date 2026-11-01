/* OpenVerse Lite device classes.
 *
 * Lite pages are server-rendered HTML with no JavaScript, sized for the built-in browsers of older
 * consoles. The class comes from the path (/ps3, /wii, /dsi) or, at the root, from the user agent.
 *
 * User agents these browsers send (from public browser-detection lists; not captured from hardware here):
 *   PS3:  Mozilla/5.0 (PLAYSTATION 3; 3.55)   Mozilla/5.0 (PLAYSTATION 3 4.91) AppleWebKit/531.22.8 (KHTML, like Gecko)
 *   Wii:  Opera/9.30 (Nintendo Wii; U; ; 3642; en)   Opera/9.30 (Nintendo Wii; U; ; 2047-7; en)
 *   DSi:  Opera/9.50 (Nintendo DSi; Opera/507; U; en-US)   DS Browser: Opera/9.50 (Nintendo DS; Opera/…)
 */

export const LITE_CLASSES = ['ps3', 'wii', 'dsi'] as const;
export type LiteClass = typeof LITE_CLASSES[number];

export type LiteProfile = {
	/** Name shown to the person */
	label: string;
	/** Posts / communities / replies per page */
	perPage: number;
	/** Page width in CSS pixels (0 = fill the screen) */
	width: number;
	/** Base font size in px */
	fontPx: number;
	/** Show the site mark and drawings (text only on the DSi) */
	images: boolean;
	/** Posts in lists are cut to this many characters (0 = whole post) */
	listChars: number;
	/** Textarea rows */
	rows: number;
	/** Padding in px around links and buttons (pointer or stylus targets) */
	touchPx: number;
};

export const PROFILES: Record<LiteClass, LiteProfile> = {
	ps3: { label: 'PlayStation 3', perPage: 10, width: 880, fontPx: 18, images: true, listChars: 0, rows: 5, touchPx: 8 },
	wii: { label: 'Wii', perPage: 6, width: 580, fontPx: 18, images: true, listChars: 140, rows: 4, touchPx: 10 },
	dsi: { label: 'Nintendo DSi', perPage: 4, width: 0, fontPx: 12, images: false, listChars: 90, rows: 3, touchPx: 4 }
};

export function isLiteClass(v: unknown): v is LiteClass {
	return typeof v === 'string' && (LITE_CLASSES as readonly string[]).includes(v);
}

/** Pick a class from the User-Agent header; PS3 sizing is the fallback for any other browser. */
export function detectClass(userAgent: string | undefined): LiteClass {
	const ua = userAgent ?? '';
	if (/Nintendo (DSi|DS)\b/i.test(ua)) {
		return 'dsi';
	}
	if (/Nintendo Wii\b/i.test(ua) && !/Wii ?U/i.test(ua)) {
		return 'wii';
	}
	if (/PLAYSTATION 3/i.test(ua)) {
		return 'ps3';
	}
	return 'ps3';
}
