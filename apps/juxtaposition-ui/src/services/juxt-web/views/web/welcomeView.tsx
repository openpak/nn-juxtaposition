import { WebLoginRoot } from '@/services/juxt-web/views/web/login';
import { T } from '@/services/juxt-web/views/common/components/T';
import type { ReactNode } from 'react';

export type WelcomeViewProps = {
	/** Where to go once the rules are accepted (a path on this site) */
	redirect: string;
};

/** Shown once, right after the first sign-in: the community rules and one button. */
export function WebWelcomeView(props: WelcomeViewProps): ReactNode {
	const extraHead = <title>{T.str('welcome.title') + ' · OpenVerse'}</title>;
	const rules = [
		<T k="welcome.rule_kind" key="kind" />,
		<T k="welcome.rule_family" key="family" />,
		<T k="welcome.rule_private" key="private" />,
		<T k="welcome.rule_spam" key="spam" />,
		<T k="welcome.rule_enforce" key="enforce" />
	];

	return (
		<WebLoginRoot head={extraHead}>
			<div className="page-narrow">
				<div className="page-head">
					<h1><T k="welcome.heading" /></h1>
					<p><T k="welcome.intro" /></p>
				</div>
				<div className="card welcome-card">
					<ul className="rules">
						{rules.map(rule => <li key={rule.key}>{rule}</li>)}
					</ul>
					<p className="terms"><a href="https://openpak.org/terms" rel="noopener"><T k="welcome.terms" /></a></p>
					<form method="post" action="/welcome/accept">
						<input type="hidden" name="redirect" value={props.redirect} />
						<div className="btn-row">
							<button type="submit" className="btn primary"><T k="welcome.accept" /></button>
							<a className="btn" href="/logout"><T k="welcome.decline" /></a>
						</div>
					</form>
				</div>
			</div>
		</WebLoginRoot>
	);
}
