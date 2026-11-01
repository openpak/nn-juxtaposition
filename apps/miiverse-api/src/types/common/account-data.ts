import type { GetUserDataResponse } from '@pretendonetwork/grpc/account/v2/get_user_data_rpc';
import type { UserWithSettingsAndFollows } from '@/services/internal/utils/user';

export interface AccountData {
	pnid: GetUserDataResponse;
	user: UserWithSettingsAndFollows | null;
	moderator: boolean;
	developer: boolean;
	/** Web sign-in of a supervised account (or parental controls could not be reached): reads only */
	readOnly: boolean;
	/** The parent turned OpenVerse off for this account (or parental controls could not be reached): nothing is served */
	openverseOff: boolean;
	/** False only for a web account that has not accepted the community rules yet */
	rulesAccepted: boolean;
}
