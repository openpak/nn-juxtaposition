import { WebLoginRoot } from '@/services/juxt-web/views/web/login';
import { T } from '@/services/juxt-web/views/common/components/T';
import type { ReactNode } from 'react';

export type DeviceRow = {
	id: string;
	deviceClass: string;
	label: string;
	createdAt: string;
	lastUsedAt: string | null;
};

export type DevicesViewProps = {
	csrf: string;
	devices: DeviceRow[];
	/** Result of the last action (n_* key suffix) */
	note: 'approved' | 'removed' | 'bad' | 'toomany' | 'slow' | null;
	/** Set on the confirmation step */
	confirm: { code: string; deviceLabel: string } | null;
};

const day = (iso: string): string => iso.slice(0, 10);

const BADGES: Record<string, string> = { ps3: 'PS3', wii: 'Wii', dsi: 'DSi', x360: '360', lite: 'Web' };

function DeviceIcon(props: { deviceClass: string }): ReactNode {
	return <span className={`dev-icon dev-${props.deviceClass}`} aria-hidden="true">{BADGES[props.deviceClass] ?? 'Web'}</span>;
}

function LinkCard(props: DevicesViewProps): ReactNode {
	const fieldError = props.note === 'bad' || props.note === 'toomany' || props.note === 'slow' ? props.note : null;
	const ok = props.note === 'approved' || props.note === 'removed' ? props.note : null;

	if (props.confirm) {
		return (
			<section className="card devices-card" aria-labelledby="dev-link">
				<h2 id="dev-link"><T k="devices.confirm_heading" /></h2>
				<p><T k="devices.confirm_text" values={{ device: props.confirm.deviceLabel }} /></p>
				<form method="post" action="/devices/approve">
					<input type="hidden" name="k" value={props.csrf} />
					<input type="hidden" name="code" value={props.confirm.code} />
					<div className="btn-row">
						<button type="submit" className="btn primary"><T k="devices.confirm_yes" /></button>
						<a className="btn" href="/devices"><T k="devices.confirm_no" /></a>
					</div>
				</form>
			</section>
		);
	}

	return (
		<section className="card devices-card" aria-labelledby="dev-link">
			<h2 id="dev-link"><T k="devices.link_heading" /></h2>
			{ok ? <p className="form-ok" role="status"><T k={`devices.n_${ok}` as 'devices.n_approved'} /></p> : null}
			<form method="post" action="/devices/check" className="form-stack" noValidate>
				<input type="hidden" name="k" value={props.csrf} />
				<label htmlFor="device-code"><T k="devices.code_label" /></label>
				<input
					id="device-code"
					name="code"
					type="text"
					className="field code-field"
					maxLength={8}
					placeholder={T.str('devices.code_placeholder')}
					autoComplete="one-time-code"
					autoCapitalize="characters"
					autoCorrect="off"
					spellCheck={false}
					required
					aria-invalid={fieldError ? 'true' : undefined}
					aria-describedby={fieldError ? 'device-code-error' : undefined}
				/>
				{fieldError
					? <p id="device-code-error" className="field-error" role="alert"><T k={`devices.n_${fieldError}` as 'devices.n_bad'} /></p>
					: null}
				<button type="submit" className="btn primary"><T k="devices.check" /></button>
			</form>
			<h3 className="help-head"><T k="devices.help_heading" /></h3>
			<ul className="help-list">
				<li><T k="devices.help_ps3" /></li>
				<li><T k="devices.help_wii" /></li>
				<li><T k="devices.help_dsi" /></li>
				<li><T k="devices.help_x360" /></li>
			</ul>
		</section>
	);
}

function ListCard(props: DevicesViewProps): ReactNode {
	return (
		<section className="card devices-card" aria-labelledby="dev-list">
			<h2 id="dev-list"><T k="devices.list_heading" /></h2>
			{props.devices.length === 0
				? (
						<div className="dev-empty">
							<p className="dev-empty-title"><T k="devices.none_heading" /></p>
							<p><T k="devices.none" /></p>
						</div>
					)
				: (
						<ul className="device-list">
							{props.devices.map(d => (
								<li key={d.id}>
									<DeviceIcon deviceClass={d.deviceClass} />
									<div className="dev-main">
										<strong>{d.label}</strong>
										<span className="meta">
											<T k="devices.added" values={{ date: day(d.createdAt) }} />
											{' · '}
											{d.lastUsedAt ? <T k="devices.last_used" values={{ date: day(d.lastUsedAt) }} /> : <T k="devices.never_used" />}
										</span>
									</div>
									<details className="dev-remove">
										<summary className="btn small"><T k="devices.revoke" /></summary>
										<form method="post" action="/devices/revoke" className="dev-confirm">
											<input type="hidden" name="k" value={props.csrf} />
											<input type="hidden" name="id" value={d.id} />
											<p><T k="devices.revoke_sure" /></p>
											<div className="btn-row">
												<button type="submit" className="btn danger small"><T k="devices.revoke_yes" /></button>
												<a className="btn small" href="/devices"><T k="devices.revoke_no" /></a>
											</div>
										</form>
									</details>
								</li>
							))}
						</ul>
					)}
		</section>
	);
}

export function WebDevicesView(props: DevicesViewProps): ReactNode {
	const extraHead = <title>{T.str('devices.title') + ' · OpenVerse'}</title>;
	const removed = props.note === 'removed';

	return (
		<WebLoginRoot head={extraHead}>
			<div className="wrap devices-page">
				<div className="page-head">
					<h1><T k="devices.heading" /></h1>
					<p><T k="devices.intro" /></p>
				</div>
				{removed ? <p className="form-ok devices-flash" role="status"><T k="devices.n_removed" /></p> : null}
				<div className="devices-grid">
					<LinkCard {...props} />
					<ListCard {...props} />
				</div>
			</div>
		</WebLoginRoot>
	);
}
