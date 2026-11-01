export type UserTokens = {
	serviceToken?: string;
	oauthToken?: string;
	/** Set by the web UI after openpak.org SSO; see apps/miiverse-api auth-populate (x-trusted-pid). */
	trustedPid?: number;
};
