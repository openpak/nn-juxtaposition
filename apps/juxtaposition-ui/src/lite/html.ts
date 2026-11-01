/* Plain HTML for OpenVerse Lite. HTML 4.01 and a few CSS 1/2 rules only: no JavaScript, no web fonts,
 * no flexbox, no media queries, no CSS variables. The Opera 9 era browsers (Wii, DSi) and NetFront
 * (PS3) render this; nothing here needs more. */

import { PROFILES } from '@/lite/device';
import type { LiteClass, LiteProfile } from '@/lite/device';

export function esc(value: unknown): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** User text: escaped, line breaks kept. */
export function text(value: string | null | undefined): string {
	return esc(value ?? '').replace(/\r\n|\r|\n/g, '<br>');
}

export function clip(value: string, max: number): string {
	if (max <= 0 || value.length <= max) {
		return value;
	}
	return value.slice(0, max - 1).trimEnd() + '…';
}

export function formatTime(iso: string | Date): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) {
		return '';
	}
	const p = (n: number): string => String(n).padStart(2, '0');
	return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

const INK = '#20262f';
const PAPER = '#e9ecf0';
const RAISED = '#ffffff';
const LINE = '#c3c9d1';
const ACCENT = '#4f46e5';
const MUTED = '#6b7380';

export function css(p: LiteProfile): string {
	const pad = p.touchPx;
	const wrap = p.width > 0 ? `width: ${p.width}px; margin: 0 auto;` : 'margin: 0;';
	return `
body { margin: 0; padding: ${p.width > 0 ? 12 : 4}px; background: ${PAPER}; color: ${INK}; font-family: Arial, Helvetica, sans-serif; font-size: ${p.fontPx}px; }
#wrap { ${wrap} }
a { color: ${ACCENT}; }
h1, h2 { margin: 0 0 ${pad}px 0; color: ${INK}; }
h1 { font-size: ${Math.round(p.fontPx * 1.4)}px; }
h2 { font-size: ${Math.round(p.fontPx * 1.15)}px; }
p { margin: 0 0 ${pad}px 0; }
#head { background: ${RAISED}; border: 1px solid ${LINE}; padding: ${pad}px; margin-bottom: ${pad}px; }
#head img { border: 0; vertical-align: middle; margin-right: 6px; }
#head .name { font-weight: bold; font-size: ${Math.round(p.fontPx * 1.2)}px; color: ${INK}; text-decoration: none; }
#nav { margin-top: ${Math.round(pad / 2)}px; }
#nav a { display: inline-block; padding: ${pad}px ${pad * 2}px; margin: 0 4px 4px 0; background: ${PAPER}; border: 1px solid ${LINE}; text-decoration: none; font-weight: bold; }
.box { background: ${RAISED}; border: 1px solid ${LINE}; padding: ${pad}px; margin-bottom: ${pad}px; }
.who { font-weight: bold; }
.meta { color: ${MUTED}; font-size: ${Math.max(10, p.fontPx - 4)}px; }
.body { margin: ${Math.round(pad / 2)}px 0; word-wrap: break-word; }
.paint { border: 1px solid ${LINE}; background: #ffffff; max-width: 100%; }
.note { background: #eceeff; border: 1px solid #c5cafb; padding: ${pad}px; margin-bottom: ${pad}px; }
.bad { background: #ffecec; border: 1px solid #e0a0a0; padding: ${pad}px; margin-bottom: ${pad}px; }
.code { font-size: ${Math.round(p.fontPx * 2.4)}px; font-weight: bold; letter-spacing: 4px; color: ${ACCENT}; }
textarea { width: 96%; font-size: ${p.fontPx}px; }
input, button { font-size: ${p.fontPx}px; padding: ${Math.round(pad / 2)}px ${pad}px; }
.pager { margin: ${pad}px 0; }
.pager a { display: inline-block; padding: ${pad}px ${pad * 2}px; border: 1px solid ${LINE}; background: ${RAISED}; text-decoration: none; margin-right: 6px; }
#foot { color: ${MUTED}; font-size: ${Math.max(10, p.fontPx - 5)}px; margin-top: ${pad * 2}px; }
`;
}

export type PageOptions = {
	cls: LiteClass;
	title: string;
	body: string;
	/** Show the navigation links (signed-in pages) */
	nav?: boolean;
	/** Seconds between automatic reloads (the link-code page) */
	refresh?: { seconds: number; url: string };
};

export function page(opt: PageOptions): string {
	const p = PROFILES[opt.cls];
	const base = `/${opt.cls}`;
	const mark = p.images
		? `<img src="/assets/web/images/icons/icon-72x72.png" width="32" height="32" alt="">`
		: '';
	const nav = opt.nav
		? `<div id="nav"><a href="${base}/">Home</a> <a href="${base}/c">Communities</a> <a href="${base}/me">This ${esc(opt.cls === 'dsi' ? 'DSi' : p.label)}</a></div>`
		: '';
	const refresh = opt.refresh
		? `<meta http-equiv="refresh" content="${opt.refresh.seconds};url=${esc(opt.refresh.url)}">\n`
		: '';
	return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
${refresh}<title>${esc(opt.title)} · OpenVerse</title>
<style type="text/css">${css(p)}</style>
</head>
<body>
<div id="wrap">
<div id="head">${mark}<a class="name" href="${base}/">OpenVerse</a>${nav}</div>
${opt.body}
<div id="foot">OpenVerse Lite for ${esc(p.label)} · <a href="${base}/about">About</a> · Part of the OpenPak network</div>
</div>
</body>
</html>
`;
}
