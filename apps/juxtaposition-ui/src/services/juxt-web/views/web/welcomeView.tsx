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
				<div className="card welcome-card">
					<h1><T k="welcome.heading" /></h1>
					<p className="lead"><T k="welcome.intro" /></p>
					<ul className="rules">
						{rules.map(rule => <li key={rule.key}>{rule}</li>)}
					</ul>
					<form method="post" action="/welcome/accept">
						<input type="hidden" name="redirect" value={props.redirect} />
						<div className="btn-row">
							<button type="submit" className="btn primary"><T k="welcome.accept" /></button>
							<a className="btn" href="/logout"><T k="welcome.decline" /></a>
							<a className="btn ghost terms" href="https://openpak.org/terms" rel="noopener"><T k="welcome.terms" /></a>
						</div>
					</form>
				</div>
			</div>
		</WebLoginRoot>
	);
}

/** A parent turned OpenVerse off for this account. */
export function WebOffView(): ReactNode {
	const extraHead = <title>{T.str('off.title') + ' · OpenVerse'}</title>;
	return (
		<WebLoginRoot head={extraHead}>
			<div className="page-narrow">
				<div className="card welcome-card">
					<h1><T k="off.heading" /></h1>
					<p className="lead"><T k="off.text" /></p>
					<div className="btn-row">
						<a className="btn" href="/logout"><T k="off.signout" /></a>
					</div>
				</div>
			</div>
		</WebLoginRoot>
	);
}
