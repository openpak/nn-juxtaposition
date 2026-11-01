/* Switch Album shares (nx-share, Album -> Post): where a shared screenshot goes. */

/** The room a share goes to when no community has the game's Switch title id. */
export const CONSOLE_SHARE_ROOM = 'Switch';

/**
 * The forms a Switch title id may be stored in on a community: the 16 hex digits as nx-share
 * sends them, lower case, and the decimal string the Wii U/3DS communities use.
 */
export function switchTitleIdForms(titleId: string): string[] {
	if (!/^[0-9A-F]{16}$/.test(titleId)) {
		return [];
	}
	return [titleId, titleId.toLowerCase(), BigInt('0x' + titleId).toString()];
}
