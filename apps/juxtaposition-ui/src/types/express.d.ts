/* eslint-disable @typescript-eslint/consistent-type-imports -- other methods of importing type dont work */

import type { GetUserDataResponse } from '@pretendonetwork/grpc/account/v2/get_user_data_rpc';
import type { i18n } from 'i18next';
import type { ParamPack } from '@/types/common/param-pack';
import type { UserTokens } from '@/types/juxt/tokens';
import type { InternalApi, Self } from '@/api/generated';

declare global {
	namespace Express {
		type ReactElement = import('react').ReactElement;

		interface Request {
			directory?: 'ctr' | 'portal' | 'web';
			api: InternalApi;
			self: Self | null;

			paramPackData: ParamPack | null;
			tokens: UserTokens;
			isWrite: boolean;
			guest_access: boolean;
			new_users: boolean;
			// legacy stuff
			pid: number | null;
			user: GetUserDataResponse | null;
		}

		type JsxforDirectoryOptions = Partial<Record<Request['directory'], ReactElement>> & {
			disableDoctypeFor?: Request['directory'][];
		};

		type ErrorRenderArgs = {
			code: string | number;
			message: string;
		};

		interface Response {
			/**
			 * Render JSX as static markup. Only static! No state or event handlers are supported.
			 */
			jsx: (el: ReactElement, addDoctype?: boolean) => Response;

			/**
			 * Render JSX for directory set on req.directory as static markup. Only static! No state or event handlers are supported.
			 */
			jsxForDirectory: (el: JsxforDirectoryOptions) => Response;

			/**
			 * Render error page
			 */
			renderError: (el: ErrorRenderArgs) => Response;

			/**
			 * Update language of current response
			 */
			changeLanguage: (lang: string | null) => Response;

			/**
			 * Language of current response
			 */
			readonly lang?: string | undefined;

			/**
			 * i18n instance of the current response
			 */
			i18n: i18n;
		}
	}
}

declare module 'express-session' {
	interface SessionData {
		tokens: UserTokens;
		// legacy stuff
		pid: number | null;
		user: GetUserDataResponse | null;
		/** openpak.org SSO sign-in in flight (state + PKCE verifier) */
		ssoPending?: import('@/sso').SsoPending;
		/** Signed-in openpak.org account for the web UI */
		/** `pid` is the number OpenVerse knows them by: their Wii U PID, or a web-only number (see webIdentity.ts) */
		sso?: { accountId: string; displayName: string; wiiuPid: number | null; pid?: number };
	}
}
