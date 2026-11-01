import { WebLoginRoot } from '@/services/juxt-web/views/web/login';
import { T } from '@/services/juxt-web/views/common/components/T';
import type { ReactNode } from 'react';

export type NoticeViewProps = {
	message: string;
};

/** A plain page for messages that stop a visitor (maintenance, bans). No forms. */
export function WebNoticeView(props: NoticeViewProps): ReactNode {
	const extraHead = <title>{T.str('notice.title') + ' · OpenVerse'}</title>;

	return (
		<WebLoginRoot head={extraHead}>
			<div className="wrapper">
				<div className="account-form-wrapper notice">
					<h2><T k="notice.title" /></h2>
					<p style={{ whiteSpace: 'pre-line' }}>{props.message}</p>
				</div>
			</div>
		</WebLoginRoot>
	);
}
