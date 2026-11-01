import { config } from '@/config';
import { WebNoticeView } from '@/services/juxt-web/views/web/noticeView';
import { PortalFatalErrorView } from '@/services/juxt-web/views/portal/errorView';
import { CtrFatalErrorView } from '@/services/juxt-web/views/ctr/errorView';
import { createInternalApiClient } from '@/api/client';
import type { RequestHandler } from 'express';
import type { DiscoveryStatus } from '@/api/generated';

export function getDiscoveryStatusMessage(status: DiscoveryStatus): string {
	const messageMap: Record<DiscoveryStatus, string> = {
		closed: 'OpenVerse is now closed. Thank you for your support!',
		maintenance: 'OpenVerse is currently under maintenance. Please try again later.',
		open: 'OpenVerse is open!', // unreachable
		unavailable: 'OpenVerse is currently unavailable. Please try again later.'
	};
	return messageMap[status];
}

export const checkDiscovery: RequestHandler = async (request, response, next) => {
	const api = createInternalApiClient({});
	const { data: discovery } = await api.discovery.get({ environment: config.serverEnvironment });
	const status = discovery.status;

	if (status !== 'open') {
		const message = getDiscoveryStatusMessage(status);
		return response.jsxForDirectory({
			web: <WebNoticeView message={message} />,
			portal: <PortalFatalErrorView code={5989999} message={message} />,
			ctr: <CtrFatalErrorView code={5989999} message={message} />
		});
	}

	request.guest_access = discovery.guestAccess;
	request.new_users = discovery.newUsers;
	// Browsers cannot resolve the console-only API host, so the web UI serves pictures itself (cdnProxy.ts)
	response.locals.cdnURL = request.directory === 'web' ? `${config.http.baseUrl.replace(/\/$/, '')}/cdn` : config.cdnDomain;

	next();
};
