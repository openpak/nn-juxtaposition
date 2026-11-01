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
			<div className="wrapper">
				<div className="account-form-wrapper notice welcome">
					<h2><T k="welcome.heading" /></h2>
					<p><T k="welcome.intro" /></p>
					<ul className="rules">
						{rules.map(rule => <li key={rule.key}>{rule}</li>)}
					</ul>
					<p><a href="https://openpak.org/terms" rel="noopener"><T k="welcome.terms" /></a></p>
					<form method="post" action="/welcome/accept">
						<input type="hidden" name="redirect" value={props.redirect} />
						<p className="actions">
							<button type="submit" className="btn primary"><T k="welcome.accept" /></button>
							{' '}
							<a href="/logout"><T k="welcome.decline" /></a>
						</p>
					</form>
				</div>
			</div>
		</WebLoginRoot>
	);
}
