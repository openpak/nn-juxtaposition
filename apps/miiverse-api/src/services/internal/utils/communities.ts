import { Community } from '@/models/community';
import { getDb } from '@/database';
import type { SelfDto } from '@/services/internal/contract/self';
import type { HydratedCommunityDocument } from '@/types/models/community';
import type { HydratedPostDocument } from '@/types/models/post';

export async function generateCommunityId(length?: number | undefined): Promise<string> {
	let id = crypto.getRandomValues(new Uint32Array(1)).toString().substring(0, length);
	const inuse = await Community.exists({ community_id: id });
	id = (inuse ? await generateCommunityId(length) : id);
	return id;
}

/**
 * A family community is the web-only page that gathers a franchise's games (OpenVerse "Mario Kart"
 * over Mario Kart 7, 8, Wii...). It is a Sub community whose Main/Announcement communities carry its
 * id as their parent; it has no posts of its own. Miiverse's own sub-communities (type Sub) are never
 * members. Returns the member game ids, or [] for any other community, so a game id passes through
 * untouched and a console never meets a family.
 */
export async function familyMemberIds(id: string): Promise<string[]> {
	const members = await getDb().community.findMany({ where: { parent: id, type: { in: [0, 2] } }, select: { olive_community_id: true } });
	return members.map(m => m.olive_community_id);
}

/** The community ids to read posts from: a family's games, or the id itself. */
export async function expandFamily(id: string): Promise<string[]> {
	const members = await familyMemberIds(id);
	return members.length > 0 ? members : [id];
}

/** Followed ids with every followed family replaced by its games (the family stays too). */
export async function expandFollowed(ids: string[]): Promise<string[]> {
	const out = new Set(ids);
	const families = await getDb().community.findMany({ where: { olive_community_id: { in: ids }, type: 1, parent: null }, select: { olive_community_id: true } });
	for (const f of families) {
		for (const m of await familyMemberIds(f.olive_community_id)) {
			out.add(m);
		}
	}
	return [...out];
}

export const accountStatusDisplayMap: Record<number, string> = {
	0: 'Normal',
	1: 'Limited from Posting',
	2: 'Temporary Ban',
	3: 'Permanent Ban'
};

export const communityTypeDisplayMap: Record<number, string> = {
	0: 'Main',
	1: 'Sub',
	2: 'Announcement',
	3: 'Private'
};

export const communityPlatformDisplayMap: Record<number, string> = {
	0: 'Wii U',
	1: '3DS',
	2: 'Both'
};

export function isPostingAllowed(community: HydratedCommunityDocument, user: SelfDto, parentPost: HydratedPostDocument | null): boolean {
	const isReply = !!parentPost;
	const isPublicPostableCommunity = community.type === 0 || community.type === 1;
	const isOpenCommunity = community.permissions.open;

	const isCommunityAdmin = community.admins?.includes(user.pid) ?? false;
	const isUserLimitedFromPosting = !user.permissions.posting;
	const hasAccessLevelRequirement = isReply
		? user.permissions.accessLevel >= community.permissions.minimum_new_comment_access_level
		: user.permissions.accessLevel >= community.permissions.minimum_new_post_access_level;

	if (isUserLimitedFromPosting) {
		return false;
	}

	if (isCommunityAdmin) {
		return true; // admins can always post (if not limited)
	}

	if (!hasAccessLevelRequirement) {
		return false;
	}

	return isReply ? isOpenCommunity : isPublicPostableCommunity;
}
