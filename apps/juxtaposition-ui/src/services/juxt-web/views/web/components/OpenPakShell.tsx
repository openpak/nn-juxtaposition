import { T } from '@/services/juxt-web/views/common/components/T';
import openpakLogoSvg from '../assets/openpak_logo.svg?raw';
import openverseMarkSvg from '../assets/openverse_mark.svg?raw';
import type { ReactNode } from 'react';

const OPENPAK = 'https://openpak.org';

function Inline(props: { svg: string; size: number }): ReactNode {
	return <span style={{ display: 'inline-flex', width: props.size, height: props.size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: props.svg }} />;
}

/** openpak.org's header: OpenPak logo (links to openpak.org), then the site mark and name (links to the site home). */
export function OpenPakTopBar(): ReactNode {
	return (
		<div className="op-top">
			<a className="op-skip" href="#main"><T k="shell.skip" /></a>
			<div className="op-wrap">
				<a href={`${OPENPAK}/`} className="op-brand"><Inline svg={openpakLogoSvg} size={28} />OpenPak</a>
				<span className="op-crumb" aria-hidden="true">/</span>
				<a href="/" className="op-brand op-site-name"><Inline svg={openverseMarkSvg} size={28} />OpenVerse</a>
			</div>
		</div>
	);
}

export function OpenPakFooter(): ReactNode {
	return (
		<footer className="op-foot">
			<div className="op-wrap">
				<div>
					<a href={`${OPENPAK}/`} className="op-brand"><Inline svg={openpakLogoSvg} size={28} />OpenPak</a>
					<p><T k="shell.tagline" /></p>
				</div>
				<nav aria-labelledby="foot-net">
					<h2 id="foot-net"><T k="shell.network" /></h2>
					<ul>
						<li><a href={`${OPENPAK}/titles`}><T k="shell.titles" /></a></li>
						<li><a href={`${OPENPAK}/status`}><T k="shell.status" /></a></li>
						<li><a href={`${OPENPAK}/help`}><T k="shell.help" /></a></li>
					</ul>
				</nav>
				<nav aria-labelledby="foot-proj">
					<h2 id="foot-proj"><T k="shell.project" /></h2>
					<ul>
						<li><a href="/about"><T k="shell.about" /></a></li>
						<li><a href="https://github.com/openpak/nn-juxtaposition" rel="noopener"><T k="shell.source" /></a></li>
						<li><a href="https://discord.gg/nMhjnsB6F6" rel="noopener"><T k="shell.community" /></a></li>
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
				<div className="op-bottom">© OpenPak · AGPL-3.0</div>
			</div>
		</footer>
	);
}
