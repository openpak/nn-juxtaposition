import { WebLoginRoot } from '@/services/juxt-web/views/web/login';
import { T } from '@/services/juxt-web/views/common/components/T';
import type { ReactNode } from 'react';

export function WebAboutView(): ReactNode {
	const extraHead = <title>{T.str('about.title')}</title>;

	return (
		<WebLoginRoot head={extraHead}>
			<div className="wrapper">
				<div className="account-form-wrapper notice">
					<h2><T k="about.heading" /></h2>
					<p><T k="about.text" /></p>
					<h3><T k="about.credits_heading" /></h3>
					<p>
						<T k="about.credit" />
						{' '}
						<a href="https://github.com/openpak/nn-juxtaposition" rel="noopener"><T k="shell.source" /></a>
					</p>
					<p><a href="/login"><T k="about.back" /></a></p>
				</div>
			</div>
		</WebLoginRoot>
	);
}
