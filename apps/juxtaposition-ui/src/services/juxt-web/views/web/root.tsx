import cx from 'classnames';
import { OpenPakFooter, OpenPakTopBar } from '@/services/juxt-web/views/web/components/OpenPakShell';
import type { ReactNode } from 'react';

export function DefaultHead(): ReactNode {
	return (
		<>
			<meta charSet="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<link rel="manifest" href="/manifest.json" />
		</>
	);
}

export function OpenVerseStyling(): ReactNode {
	return <link rel="stylesheet" type="text/css" href="/assets/web/css/openverse.css" />;
}

type DefaultStylingType = 'normal' | 'admin';

export type DefaultStylingProps = {
	type: DefaultStylingType;
};

export function DefaultStyling(props: DefaultStylingProps): ReactNode {
	if (props.type === 'admin') {
		return (
			<>
				<link rel="stylesheet" type="text/css" href="/assets/web/css/admin.css" />
				<script src="/assets/web/js/admin.global.js" />
			</>
		);
	} else /* if (props.type === "normal") */ {
		return (
			<>
				<link rel="stylesheet" type="text/css" href="/assets/web/css/web.css" />
				<script src="/assets/web/js/web.global.js" />
			</>
		);
	}
}

export type HtmlProps = {
	children?: ReactNode;
	head?: ReactNode;

	type?: DefaultStylingType; // default "normal"
};

export function WebRoot(props: HtmlProps): ReactNode {
	const stylingType = props.type ?? 'normal';

	return (
		<html lang="en">
			<head>
				<DefaultHead />
				<DefaultStyling type={stylingType} />
				{props.head}
				<OpenVerseStyling />
			</head>
			<body>
				<OpenPakTopBar />
				<div id="main">{props.children}</div>
				<OpenPakFooter />
			</body>
		</html>
	);
}

export type WrapperProps = {
	children?: ReactNode;
	className?: string;
};

export function WebWrapper(props: WrapperProps): ReactNode {
	return (
		<div className={cx('container page', props.className)}>
			{props.children}
		</div>
	);
}
