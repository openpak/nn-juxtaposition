import cx from 'classnames';
import { isValidElement } from 'react';
import { OpenPakFooter, OpenPakTopBar } from '@/services/juxt-web/views/web/components/OpenPakShell';
import type { ReactElement, ReactNode } from 'react';

export function DefaultHead(): ReactNode {
	return (
		<>
			<meta charSet="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<link rel="manifest" href="/manifest.json" />
		</>
	);
}

/** True when a head fragment already carries a <title>. */
function hasTitle(node: ReactNode): boolean {
	if (Array.isArray(node)) {
		return node.some(hasTitle);
	}
	if (!isValidElement(node)) {
		return false;
	}
	const el = node as ReactElement<{ children?: ReactNode }>;
	return el.type === 'title' || hasTitle(el.props.children);
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
				{hasTitle(props.head) ? null : <title>OpenVerse</title>}
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
