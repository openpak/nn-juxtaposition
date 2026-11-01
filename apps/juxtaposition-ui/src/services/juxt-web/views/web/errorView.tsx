import { WebLoginRoot } from '@/services/juxt-web/views/web/login';
import { T } from '@/services/juxt-web/views/common/components/T';
import type { ReactNode } from 'react';
import type { ReqId } from 'pino-http';

export type ErrorViewProps = {
	requestId: ReqId;
	code: string | number;
	message: string;
};

export type FatalErrorViewProps = {
	code: string | number;
	message: string;
};

export function WebErrorView(props: ErrorViewProps): ReactNode {
	const extraHead = (
		<title>
			{T.str('error.title', { code: props.code }) + ' · OpenVerse'}
		</title>
	);

	return (
		<WebLoginRoot head={extraHead}>
			<div className="wrapper">
				<div className="account-form-wrapper">
					<h2>
						<T k="error.heading" values={{ code: props.code, message: props.message }} />
					</h2>
					<h3>
						<T
							k="error.message_web"
							withNewline
							components={{
								status: <a href="https://stats.uptimerobot.com/R7E4wiGjJq">...</a>,
								home: <a href="/">...</a>
							}}
						/>
					</h3>
					<p>
						<T
							k="error.error_details"
							values={{ id: props.requestId.toString() }}
						/>
					</p>
				</div>
			</div>
		</WebLoginRoot>
	);
}
