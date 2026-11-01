import { config } from '@/config';
import type { Request, RequestHandler } from 'express';

const webHosts = config.domains.web.split(',').map(h => h.trim());

export const detectVersion: RequestHandler = async (request, response, next) => {
	// Check the domain and set the directory. The web UI is whatever hosts config.domains.web lists
	// (verse.openpak.org); anything else is a console host.
	if (webHosts.includes(request.hostname)) {
		request.directory = 'web';
		response.changeLanguage(null);
	} else {
		request.directory = includes(request, 'portal') ? 'portal' : 'ctr';
	}

	request.isWrite = request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE';

	next();
};

function includes(request: Request, domain: string): boolean {
	return request.subdomains.findIndex(element => element.includes(domain)) !== -1;
}
