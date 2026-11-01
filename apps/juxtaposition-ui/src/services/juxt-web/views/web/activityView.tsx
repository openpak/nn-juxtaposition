import cx from 'classnames';
import moment from 'moment';
import { WebNavBar } from '@/services/juxt-web/views/web/navbar';
import { WebRoot, WebWrapper } from '@/services/juxt-web/views/web/root';
import { T } from '@/services/juxt-web/views/common/components/T';
import { WebUIIcon } from '@/services/juxt-web/views/web/components/ui/WebUIIcon';
import { WebMiiIcon } from '@/services/juxt-web/views/web/components/ui/WebMiiIcon';
import type { ReactNode } from 'react';
import type { ActivityItem, ActivitySettings } from '@/api/generated';
import type { ListViewLinks } from '@/services/juxt-web/views/web/listView';

type TextKey = 'badge' | 'splatfest' | 'kart' | 'maker' | 'trophy' | 'trade';

const textKeys: Record<TextKey, string> = {
	badge: 'activity.text.badge',
	splatfest: 'activity.text.splatfest',
	kart: 'activity.text.kart',
	maker: 'activity.text.maker',
	trophy: 'activity.text.trophy',
	trade: 'activity.text.trade'
};

const icons = {
	badge: 'star-badge',
	trophy: 'star-badge',
	splatfest: 'flag',
	kart: 'flag',
	maker: 'hammer',
	trade: 'up-down',
	digest: 'bell'
} as const;

export type ActivityListProps = ListViewLinks & {
	items: ActivityItem[];
	/** Hide the name and avatar (a profile already says whose it is). */
	onProfile?: boolean;
};

function iconName(category: string): (typeof icons)[keyof typeof icons] {
	return category in icons ? icons[category as keyof typeof icons] : icons.digest;
}

export function WebActivityItem(props: { item: ActivityItem; onProfile?: boolean }): ReactNode {
	const item = props.item;
	const known = item.category in textKeys;
	// A moment of a category this build does not know is left out rather than shown half-rendered.
	if (!item.digest && !known) {
		return null;
	}

	const what = item.digest
		? <T k="activity.text.digest" values={{ count: item.count }} />
		: <T k={textKeys[item.category as TextKey] as never} values={{ subject: item.subject }} />;

	return (
		<div className={cx('activity-item', { digest: item.digest })} data-category={item.digest ? 'digest' : item.category}>
			{props.onProfile
				? null
				: <WebMiiIcon pid={item.pid} type="mii-icon" />}
			<div className="activity-body">
				<p className="activity-text">
					{props.onProfile ? null : <><a className="activity-who" href={`/users/${item.pid}`}>{item.name}</a>{' '}</>}
					{item.link ? <a className="activity-what" href={item.link}>{what}</a> : <span className="activity-what">{what}</span>}
				</p>
				<p className="extra-info">{moment(item.createdAt).fromNow()}</p>
			</div>
			{item.image
				? <img className="activity-art" src={item.image} alt="" loading="lazy" />
				: <span className="activity-icon"><WebUIIcon name={iconName(item.digest ? 'digest' : item.category)} /></span>}
		</div>
	);
}

export function WebActivityList(props: ActivityListProps & { fragment?: boolean }): ReactNode {
	const shown = props.items.filter(i => i.digest || i.category in textKeys);
	const more = props.items.length > 0
		? (
				<div id="wrapper" className="bottom">
					<button id="load-more" data-href={props.nextLink}><T k="activity.more" /></button>
				</div>
			)
		: null;
	// "Show more" swaps its own wrapper for the next page, so that page is a bare fragment.
	if (props.fragment) {
		return <>{shown.map(item => <WebActivityItem key={item.id} item={item} onProfile={props.onProfile} />)}{more}</>;
	}
	if (shown.length === 0) {
		return <p className="no-posts-text"><T k="activity.empty" /></p>;
	}
	return (
		<div className="activity-list">
			{shown.map(item => <WebActivityItem key={item.id} item={item} onProfile={props.onProfile} />)}
			{more}
		</div>
	);
}

export type ActivityPageProps = ActivityListProps & {
	scope: 'everyone' | 'following';
};

export function WebActivityPage(props: ActivityPageProps): ReactNode {
	return (
		<WebRoot head={<title>{T.str('activity.title') + ' · OpenVerse'}</title>}>
			<h2 id="title" className="page-header"><T k="activity.title" /></h2>
			<WebNavBar selection={6} />
			<div id="toast"></div>
			<WebWrapper>
				<div className="buttons tabs" style={{ marginBottom: '1.5em' }}>
					<a href="/activity" className={cx({ selected: props.scope === 'everyone' })}><T k="activity.everyone" /></a>
					<a href="/activity?scope=following" className={cx({ selected: props.scope === 'following' })}><T k="activity.following" /></a>
					<a href="/activity/settings"><T k="activity.settings_link" /></a>
				</div>
				<WebActivityList {...props} />
			</WebWrapper>
		</WebRoot>
	);
}

export type ActivitySettingsPageProps = {
	settings: ActivitySettings;
	readOnly: boolean;
	saved: boolean;
};

const categoryLabels: Record<TextKey, string> = {
	badge: 'activity.category.badge',
	splatfest: 'activity.category.splatfest',
	kart: 'activity.category.kart',
	maker: 'activity.category.maker',
	trophy: 'activity.category.trophy',
	trade: 'activity.category.trade'
};

export function WebActivitySettingsPage(props: ActivitySettingsPageProps): ReactNode {
	const { settings } = props;
	return (
		<WebRoot head={<title>{T.str('activity.settings_title') + ' · OpenVerse'}</title>}>
			<h2 id="title" className="page-header"><T k="activity.settings_title" /></h2>
			<WebNavBar selection={6} />
			<div id="toast"></div>
			<WebWrapper>
				<div className="activity-settings">
					<p><T k="activity.settings_intro" /></p>
					{props.saved ? <p className="activity-saved" role="status"><T k="activity.saved" /></p> : null}
					{props.readOnly
						? <p className="activity-readonly"><T k="activity.read_only" /></p>
						: null}
					<form method="post" action="/activity/settings">
						<label className="activity-switch">
							<input type="checkbox" name="enabled" value="1" defaultChecked={settings.enabled} disabled={props.readOnly} />
							{' '}
							<span><T k="activity.post_activity" /></span>
						</label>
						<fieldset disabled={props.readOnly}>
							<legend><T k="activity.categories" /></legend>
							{settings.categories.map(c => (
								<label className="activity-switch" key={c.id}>
									<input type="checkbox" name="category" value={c.id} defaultChecked={c.enabled} />
									{' '}
									<span><T k={categoryLabels[c.id as TextKey] as never} /></span>
								</label>
							))}
						</fieldset>
						<p className="activity-note"><T k="activity.settings_note" /></p>
						<p className="actions">
							<button type="submit" className="btn primary" disabled={props.readOnly}><T k="activity.save" /></button>
							{' '}
							<a href="/activity"><T k="activity.back" /></a>
						</p>
					</form>
				</div>
			</WebWrapper>
		</WebRoot>
	);
}
