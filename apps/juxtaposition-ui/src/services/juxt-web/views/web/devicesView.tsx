import { WebLoginRoot } from '@/services/juxt-web/views/web/login';
import { T } from '@/services/juxt-web/views/common/components/T';
import type { ReactNode } from 'react';

export type DeviceRow = {
	id: string;
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

export function WebDevicesView(props: DevicesViewProps): ReactNode {
	const extraHead = <title>{T.str('devices.title') + ' · OpenVerse'}</title>;
	const bad = props.note === 'bad' || props.note === 'toomany' || props.note === 'slow';

	return (
		<WebLoginRoot head={extraHead}>
			<div className="page-narrow">
				<div className="page-head">
					<h1><T k="devices.heading" /></h1>
					<p><T k="devices.intro" /></p>
				</div>
				<div className="card devices-card">
					{props.note
						? <p className={bad ? 'form-error' : 'form-ok'} role="status"><T k={`devices.n_${props.note}` as 'devices.n_bad'} /></p>
						: null}
					{props.confirm
						? (
								<form method="post" action="/devices/approve">
									<h2><T k="devices.confirm_heading" /></h2>
									<p><T k="devices.confirm_text" values={{ device: props.confirm.deviceLabel }} /></p>
									<input type="hidden" name="k" value={props.csrf} />
									<input type="hidden" name="code" value={props.confirm.code} />
									<div className="btn-row">
										<button type="submit" className="btn primary"><T k="devices.confirm_yes" /></button>
										<a className="btn" href="/devices"><T k="devices.confirm_no" /></a>
									</div>
								</form>
							)
						: (
								<form method="post" action="/devices/check">
									<input type="hidden" name="k" value={props.csrf} />
									<label htmlFor="device-code"><T k="devices.code_label" /></label>
									<input id="device-code" name="code" type="text" maxLength={8} autoComplete="off" autoCapitalize="characters" spellCheck={false} required className="device-code" />
									<div className="btn-row">
										<button type="submit" className="btn primary"><T k="devices.check" /></button>
									</div>
								</form>
							)}
					<h2><T k="devices.list_heading" /></h2>
					{props.devices.length === 0
						? <p><T k="devices.none" /></p>
						: (
								<ul className="device-list">
									{props.devices.map(d => (
										<li key={d.id}>
											<span>
												<strong>{d.label}</strong>
												<br />
												<span className="meta">
													<T k="devices.added" values={{ date: day(d.createdAt) }} />
													{' · '}
													{d.lastUsedAt ? <T k="devices.last_used" values={{ date: day(d.lastUsedAt) }} /> : <T k="devices.never_used" />}
												</span>
											</span>
											<form method="post" action="/devices/revoke" className="inline">
												<input type="hidden" name="k" value={props.csrf} />
												<input type="hidden" name="id" value={d.id} />
												<button type="submit" className="btn"><T k="devices.revoke" /></button>
											</form>
										</li>
									))}
								</ul>
							)}
				</div>
			</div>
		</WebLoginRoot>
	);
}
