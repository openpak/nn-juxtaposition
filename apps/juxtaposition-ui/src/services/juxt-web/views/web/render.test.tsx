import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import en from '@/assets/locales/en.json';
import { ContextProviders } from '@/middleware/jsx';
import { WebNoticeView } from '@/services/juxt-web/views/web/noticeView';
import { WebNoWiiuView } from '@/services/juxt-web/views/web/noWiiuView';
import { WebAboutView } from '@/services/juxt-web/views/web/aboutView';
import { WebFirstRunView } from '@/services/juxt-web/views/web/firstRunView';
import { logoutRouter } from '@/services/juxt-web/routes/web/logout';
import { WebErrorView } from '@/services/juxt-web/views/web/errorView';
import { WebRoot } from '@/services/juxt-web/views/web/root';
import type { ReactElement } from 'react';

async function render(el: ReactElement, pid = 1000000000, displayName?: string): Promise<string> {
	const i18n = i18next.createInstance();
	await i18n.use(initReactI18next).init({
		lng: 'en',
		resources: { en: { ns: en } },
		defaultNS: 'ns',
		interpolation: { escapeValue: false },
		react: { useSuspense: false }
	});
	return renderToStaticMarkup(
		<ContextProviders ctx={{ i18n, cdnUrl: '', moderator: false, developer: false, pid, displayName }}>{el}</ContextProviders>
	);
}

describe('web shell', () => {
	it('has the shared Open-site header and footer and no forms', async () => {
		const html = await render(<WebNoticeView message="Maintenance" />);
		expect(html).toContain('<title>Notice · OpenVerse</title>');
		expect(html).toContain('class="brand"');
		expect(html).not.toContain('<form');
		expect(html).toContain('href="/login"');
		expect(html).toContain('https://openpak.org/terms');
		expect(html).toContain('github.com/openpak/nn-juxtaposition');
		expect(html).toContain('© OpenPak · AGPL-3.0 · Based on Juxtaposition by Pretendo Network. Miiverse is a trademark of Nintendo.');
		// No OpenPak logo in the header and no other network's links
		expect(html).not.toMatch(/pretendo\.|preten\.do/i);
	});

	it('shows the signed-in chip with the display name initial', async () => {
		const html = await render(<WebNoticeView message="x" />, 1800000001, 'Tobi');
		expect(html).toContain('class="avatar-btn"');
		expect(html).toContain('>T</a>');
		expect(html).toContain('href="/logout"');
	});

	it('about page carries the AGPL credit and the source link', async () => {
		const html = await render(<WebAboutView />);
		expect(html).toContain('Based on Juxtaposition by Pretendo Network (AGPL-3.0)');
		expect(html).toContain('https://github.com/openpak/nn-juxtaposition');
	});

	it('no-Wii-U page links to openpak.org', async () => {
		const html = await render(<WebNoWiiuView linkUrl="https://openpak.org/account" />);
		expect(html).toContain('No Wii U linked');
		expect(html).toContain('href="https://openpak.org/account"');
	});

	it('first-run page is titled Welcome', async () => {
		const html = await render(<WebFirstRunView />);
		expect(html).toContain('<title>Welcome · OpenVerse</title>');
	});

	it('logout ends only this site and lands on /about, never openpak.org', () => {
		const calls: unknown[][] = [];
		const req = { session: { destroy: (cb: () => void) => cb() } };
		const res = {
			set: (...a: unknown[]) => calls.push(['set', ...a]),
			clearCookie: (...a: unknown[]) => calls.push(['clear', ...a]),
			redirect: (...a: unknown[]) => calls.push(['redirect', ...a])
		};
		const layer = logoutRouter.stack[0]!.route!.stack[0]!;
		layer.handle(req as never, res as never, (() => {}) as never);
		expect(calls).toContainEqual(['redirect', 303, '/about']);
		expect(calls).toContainEqual(['clear', 'connect.sid']);
		expect(JSON.stringify(calls)).not.toContain('openpak.org');
	});

	it('error page renders under the OpenVerse title', async () => {
		const html = await render(<WebErrorView requestId="r1" code={404} message="nope" />);
		expect(html).toContain('Error 404 · OpenVerse');
	});

	it('pages without their own title get the site title, never a duplicate', async () => {
		const plain = await render(<WebRoot>x</WebRoot>);
		expect(plain.match(/<title>/g)).toHaveLength(1);
		expect(plain).toContain('<title>OpenVerse</title>');
		const own = await render(<WebRoot head={<title>Feed · OpenVerse</title>}>x</WebRoot>);
		expect(own.match(/<title>/g)).toHaveLength(1);
	});
});
