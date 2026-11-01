import { OpenPakFooter, OpenPakTopBar } from '@/services/juxt-web/views/web/components/OpenPakShell';
import { DefaultHead, OpenVerseStyling } from '@/services/juxt-web/views/web/root';
import type { ReactNode } from 'react';
import type { HtmlProps } from '@/services/juxt-web/views/web/root';

export function LoginHead(): ReactNode {
	return (
		<>
			{/* windows/ios/chrome */}
			<meta httpEquiv="X-UA-Compatible" content="ie=edge" />
			<meta name="apple-mobile-web-app-title" content="OpenVerse" />
			<meta name="application-name" content="OpenVerse" />
			<meta name="msapplication-TileColor" content="#4f46e5" />
			<meta name="theme-color" content="#e9ecf0" media="(prefers-color-scheme: light)" />
			<meta name="theme-color" content="#24272d" media="(prefers-color-scheme: dark)" />

			{/* open graph/embeds */}
			<meta property="og:title" content="OpenVerse" />
			<meta property="og:description" content="OpenVerse is OpenPak's social network for Wii U and 3DS: communities, posts and drawings from your console." />
			<meta property="og:type" content="website" />
			<meta property="og:url" content="https://openverse.openpak.org/" />
			<meta property="og:image" content="https://openverse.openpak.org/assets/web/images/opengraph.png" />
			<meta property="og:image:alt" content="OpenVerse" />
			<meta property="og:site_name" content="OpenVerse" />

			{/* twitter embeds */}
			<meta name="twitter:url" content="https://openverse.openpak.org/" />
			<meta name="twitter:card" content="summary_large_image" />
			<meta name="twitter:title" content="OpenVerse" />
			<meta name="twitter:description" content="OpenVerse is OpenPak's social network for Wii U and 3DS: communities, posts and drawings from your console." />
			<meta name="twitter:image" content="https://openverse.openpak.org/assets/web/images/opengraph.png" />

			{/* google seo */}
			<meta name="description" content="OpenVerse is OpenPak's social network for Wii U and 3DS: communities, posts and drawings from your console." />
			<meta name="robots" content="index, follow" />

			{/* favicon */}
			<link rel="apple-touch-icon" href="/assets/web/images/icons/icon-180x180.png" />
			<link rel="icon" type="image/svg+xml" href="/assets/web/images/icons/openverse.svg" />
			<link rel="icon" type="image/png" href="/assets/web/images/icons/icon-192x192.png" />

			<link rel="stylesheet" href="/assets/web/css/login.css" />
			<script src="/assets/web/js/login.global.js" />
		</>
	);
}

export function WebLoginRoot(props: HtmlProps): ReactNode {
	return (
		<html lang="en">
			<head>
				<DefaultHead />
				<LoginHead />
				{props.head}
				<OpenVerseStyling />
			</head>
			<body>
				<OpenPakTopBar />
				<div className="main-body" id="main">
					{props.children}
				</div>
				<OpenPakFooter />
			</body>
		</html>
	);
}
