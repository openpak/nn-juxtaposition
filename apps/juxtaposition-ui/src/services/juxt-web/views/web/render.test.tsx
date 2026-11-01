import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import en from '@/assets/locales/en.json';
import { ContextProviders } from '@/middleware/jsx';
import { WebNoticeView } from '@/services/juxt-web/views/web/noticeView';
import { WebAboutView } from '@/services/juxt-web/views/web/aboutView';
import { WebWelcomeView } from '@/services/juxt-web/views/web/welcomeView';
import { WebNewPostPage } from '@/services/juxt-web/views/web/newPostView';
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
		expect(html).toContain('<span><a href="https://openpak.org/">Part of the OpenPak network</a> · © OpenPak · AGPL-3.0 · Based on Juxtaposition by Pretendo Network. Miiverse is a trademark of Nintendo.</span>');
		expect(html).toContain('OpenVerse is OpenPak&#x27;s community space: posts, drawings and conversations about the games you play.');
		expect(html.match(/Part of the OpenPak network/g)).toHaveLength(1);
		expect(html).not.toMatch(/for Wii U and 3DS|from your console/);
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

	it('welcome page shows the rules and one accept button, no console wording', async () => {
		const html = await render(<WebWelcomeView redirect="/titles" />);
		expect(html).toContain('<title>Welcome · OpenVerse</title>');
		expect(html).toContain('Welcome to OpenVerse');
		expect(html).toContain('<form action="/welcome/accept" method="post">');
		expect(html).toContain('value="/titles"');
		expect(html).toContain('Accept and continue');
		expect(html.match(/<ul class="rules">(.*?)<\/ul>/)![1]!.match(/<li>/g)).toHaveLength(5);
		expect(html).not.toMatch(/no_wiiu|welcome\.|new_post\./);
		expect(html).not.toMatch(/first.run|Account Creation|Wii U linked|finish setup/i);
		expect(html).not.toMatch(/pretendo\.|preten\.do/i);
	});

	it('new post page has text and drawing, and a drawing field the server reads as a BMP', async () => {
		const html = await render(<WebNewPostPage id="1" name="Help" url="/posts/new" show="post" shotMode="block" />);
		expect(html).toContain('name="_post_type"');
		expect(html).toContain('data-drawing-canvas');
		expect(html).toContain('width="320" height="120"');
		expect(html).toContain('name="bmp" value="true"');
		expect(html).toContain('name="painting"');
		expect(html).toContain('drawing.global.js');
		expect(html).not.toContain('Posting is disabled on web');
		expect(html).not.toMatch(/new_post\./);
		// no image or screenshot upload from the web
		expect(html).not.toMatch(/type="file"|name="shot"|name="screenshot"/);
	});

	it('new post page tells a supervised account why it cannot post, with no form', async () => {
		const html = await render(<WebNewPostPage id="1" name="Help" url="/posts/new" show="post" shotMode="block" readOnly />);
		expect(html).toContain('Posting is turned off for this account');
		expect(html).not.toContain('<form');
		expect(html).not.toContain('data-drawing-canvas');
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

describe('game activity', () => {
	const item = (over: Record<string, unknown> = {}): never => ({
		id: 1, pid: 1800000001, name: 'Tobi', category: 'badge', subject: 'Kart Racer: Wii Era', link: 'https://openpak.org/account/rewards',
		image: 'https://rewards.openpak.org/v1/items/b/preview', count: 1, digest: false, createdAt: new Date().toISOString(), ...over
	}) as never;
	const links = { nextLink: '/activity?offset=1&pjax=true', prevPageLink: null, nextPageLink: '/activity?offset=1' };

	it('renders a badge post with the name, art and link', async () => {
		const { WebActivityList } = await import('@/services/juxt-web/views/web/activityView');
		const html = await render(<WebActivityList {...links} items={[item()]} />, 1800000001, 'Tobi');
		expect(html).toContain('Tobi');
		expect(html).toContain('earned the Kart Racer: Wii Era badge');
		expect(html).toContain('href="https://openpak.org/account/rewards"');
		expect(html).toContain('class="activity-art"');
		expect(html).not.toMatch(/activity\.(text|empty)/);
	});

	it('offers Remove on your own post and on nobody else\'s', async () => {
		const { WebActivityList } = await import('@/services/juxt-web/views/web/activityView');
		const mine = await render(<WebActivityList {...links} hasMore items={[item()]} />, 1800000001, 'Tobi');
		expect(mine).toContain('action="/activity/1/delete"');
		expect(mine).toContain('Show more');
		const other = await render(<WebActivityList {...links} items={[item()]} />, 1800000002, 'Ada');
		expect(other).not.toContain('/delete');
		expect(other).not.toContain('Show more');
	});

	it('renders a digest and an empty state without raw keys', async () => {
		const { WebActivityList } = await import('@/services/juxt-web/views/web/activityView');
		expect(await render(<WebActivityList {...links} items={[item({ digest: true, category: 'digest', count: 3, subject: '', link: '', image: '' })]} />)).toContain('3 more moments today');
		const empty = await render(<WebActivityList {...links} items={[]} />);
		expect(empty).toContain('No game activity yet.');
	});

	it('leaves out a category it does not know', async () => {
		const { WebActivityList } = await import('@/services/juxt-web/views/web/activityView');
		const html = await render(<WebActivityList {...links} items={[item({ category: 'mystery' })]} />);
		expect(html).not.toContain('mystery');
	});

	it('settings page: everything off by default, only live categories, no raw keys', async () => {
		const { WebActivitySettingsPage } = await import('@/services/juxt-web/views/web/activityView');
		const settings = { enabled: false, categories: [{ id: 'badge', enabled: false }] } as never;
		const html = await render(<WebActivitySettingsPage settings={settings} readOnly={false} saved={false} />, 1800000001, 'Tobi');
		expect(html).toContain('Post my game activity');
		expect(html).toContain('Rewards badges I earn');
		expect(html).not.toContain('checked');
		expect(html).not.toContain('Splatfest');
		expect(html).not.toMatch(/activity\.[a-z_]+/);
		const ro = await render(<WebActivitySettingsPage settings={settings} readOnly saved={false} />, 1800000001, 'Tobi');
		expect(ro).toContain('This account is supervised');
		expect(ro).toContain('disabled');
	});
});
