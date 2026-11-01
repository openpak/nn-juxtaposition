import { T } from '@/services/juxt-web/views/common/components/T';
import { useUser } from '@/services/juxt-web/views/common/hooks/useUser';
import openverseMarkSvg from '../assets/openverse_mark.svg?raw';
import type { ReactNode } from 'react';

const OPENPAK = 'https://openpak.org';

function Mark(props: { size: number }): ReactNode {
	return <span className="mark" style={{ width: props.size, height: props.size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: openverseMarkSvg }} />;
}

/** The shared Open-site header: the site mark and name only, then this site's own links. */
export function OpenPakTopBar(): ReactNode {
	const user = useUser();
	const signedIn = user.pid !== 1000000000;
	const initial = (user.displayName ?? '').trim().slice(0, 1) || '?';

	return (
		<div className="top" role="banner">
			<a className="skip" href="#main"><T k="shell.skip" /></a>
			<div className="wrap">
				<a href="/" className="brand"><Mark size={32} />OpenVerse</a>
				<nav aria-label="OpenVerse" className="navlinks">
					<a href="/titles"><T k="shell.communities" /></a>
					{signedIn ? <a href="/devices"><T k="shell.devices" /></a> : null}
					<a href="/about"><T k="shell.about" /></a>
				</nav>
				<div className="ml-auto">
					{signedIn
						? (
								<>
									<a className="btn ghost" href="/logout"><T k="shell.signout" /></a>
									<a className="avatar-btn" href="/users/me" aria-label={user.displayName ?? ''} title={user.displayName ?? ''}>{initial}</a>
								</>
							)
						: <a className="btn ghost" href="/login"><T k="shell.signin" /></a>}
				</div>
			</div>
		</div>
	);
}

export function OpenPakFooter(): ReactNode {
	return (
		<footer className="site-foot">
			<div className="wrap">
				<div>
					<a href="/" className="brand"><Mark size={28} />OpenVerse</a>
					<p className="muted"><T k="shell.tagline" /></p>
				</div>
				<nav aria-labelledby="foot-net">
					<h2 id="foot-net"><T k="shell.openpak" /></h2>
					<ul>
						<li><a href={`${OPENPAK}/`}><T k="shell.home" /></a></li>
						<li><a href={`${OPENPAK}/titles`}><T k="shell.titles" /></a></li>
						<li><a href={`${OPENPAK}/features`}><T k="shell.features" /></a></li>
						<li><a href={`${OPENPAK}/status`}><T k="shell.status" /></a></li>
					</ul>
				</nav>
				<nav aria-labelledby="foot-ov">
					<h2 id="foot-ov">OpenVerse</h2>
					<ul>
						<li><a href="/titles"><T k="shell.communities" /></a></li>
						<li><a href="/about"><T k="shell.about" /></a></li>
					</ul>
				</nav>
				<nav aria-labelledby="foot-proj">
					<h2 id="foot-proj"><T k="shell.project" /></h2>
					<ul>
						<li><a href="https://github.com/openpak/nn-juxtaposition" rel="noopener"><T k="shell.source" /></a></li>
						<li><a href={`${OPENPAK}/help`}><T k="shell.help" /></a></li>
					</ul>
				</nav>
				<nav aria-labelledby="foot-legal">
					<h2 id="foot-legal"><T k="shell.legal_heading" /></h2>
					<ul>
						<li><a href={`${OPENPAK}/terms`}><T k="shell.terms" /></a></li>
						<li><a href={`${OPENPAK}/privacy`}><T k="shell.privacy" /></a></li>
						<li><a href={`${OPENPAK}/legal`}><T k="shell.legal" /></a></li>
					</ul>
				</nav>
				<div className="foot-bottom"><span><a href={`${OPENPAK}/`}><T k="shell.part_of" /></a> · © OpenPak · AGPL-3.0 · <T k="shell.fine_print" /></span></div>
			</div>
		</footer>
	);
}
