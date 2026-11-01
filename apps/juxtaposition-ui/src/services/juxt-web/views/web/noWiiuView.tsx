import { WebLoginRoot } from '@/services/juxt-web/views/web/login';
import { T } from '@/services/juxt-web/views/common/components/T';
import type { ReactNode } from 'react';

export type NoWiiuViewProps = {
	linkUrl: string;
};

export function WebNoWiiuView(props: NoWiiuViewProps): ReactNode {
	const extraHead = <title>{T.str('no_wiiu.title')}</title>;

	return (
		<WebLoginRoot head={extraHead}>
			<div className="wrapper">
				<div className="account-form-wrapper notice">
					<h2><T k="no_wiiu.title" /></h2>
					<p><T k="no_wiiu.text" /></p>
					<p><a className="btn primary" href={props.linkUrl}><T k="no_wiiu.action" /></a></p>
				</div>
			</div>
		</WebLoginRoot>
	);
}
