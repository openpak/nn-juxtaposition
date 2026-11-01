import type { GetUserDataResponse } from '@pretendonetwork/grpc/account/v2/get_user_data_rpc';

/* Web-only OpenPak accounts (see apps/miiverse-api/src/services/web-identity) have a number above
 * every Wii U/3DS PID and no console account behind it, so there is nobody to ask the account
 * server about. This is the record the UI uses for them. */

export const WEB_ONLY_PID_MIN = 1_800_000_001;
export const WEB_ONLY_PID_MAX = 2_147_483_647;

export function isWebOnlyPid(pid: number): boolean {
	return Number.isInteger(pid) && pid >= WEB_ONLY_PID_MIN && pid <= WEB_ONLY_PID_MAX;
}

export function webOnlyAccount(pid: number): GetUserDataResponse {
	return {
		deleted: false,
		pid,
		username: '',
		accessLevel: 0,
		serverAccessLevel: 'prod',
		mii: undefined,
		creationDate: '',
		birthdate: '',
		gender: '',
		country: '',
		language: '',
		emailAddress: '',
		tierName: '',
		permissions: undefined,
		linkedDevices: []
	};
}
