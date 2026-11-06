import type { Community as CommunityRow } from '@/prisma/client';
import type { CommunityDocument } from '@/models/community';

export enum COMMUNITY_TYPE {
	Main = 0,
	Sub = 1,
	Announcement = 2,
	Private = 3
}

export interface IIconPaths {
	32: string;
	48: string;
	64: string;
	96: string;
	128: string;
}

export interface ICommunityPermissions {
	open: boolean;
	minimum_new_post_access_level: number;
	minimum_new_comment_access_level: number;
	minimum_new_community_access_level: number;
}

export const CommunityShotModes = ['allow', 'block', 'force'] as const;
export type CommunityShotMode = typeof CommunityShotModes[number];

/** The row columns that make up the nested `permissions` and `icon_paths` objects */
export type CommunityNestedColumns =
	'permissions_open' |
	'minimum_new_post_access_level' |
	'minimum_new_comment_access_level' |
	'minimum_new_community_access_level' |
	'icon_path_32' |
	'icon_path_48' |
	'icon_path_64' |
	'icon_path_96' |
	'icon_path_128';

/** A community as the code sees it: the `communities` row, with the permission and icon path
 * columns folded back into the objects the Mongo documents had. */
export type ICommunity = Omit<CommunityRow, CommunityNestedColumns> & {
	permissions: ICommunityPermissions;
	icon_paths: IIconPaths | null;
};

type NullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? K : never }[keyof T];

// Columns with a database default are optional on input but always set on output
type CommunityDefaultedFields =
	'open' |
	'allows_comments' |
	'type' |
	'admins' |
	'created_at' |
	'empathy_count' |
	'has_shop_page' |
	'title_id' |
	'is_recommended' |
	'app_data' |
	'user_favorites' |
	'shot_mode' |
	'shot_extra_title_id' |
	'family';

type CommunityOptionalFields = CommunityDefaultedFields | NullableKeys<ICommunity>;

export type ICommunityInput = Omit<ICommunity, CommunityOptionalFields | 'permissions'> &
	Partial<Pick<ICommunity, CommunityOptionalFields>> &
	{ permissions?: Partial<ICommunityPermissions> };

export type HydratedCommunityDocument = CommunityDocument;
