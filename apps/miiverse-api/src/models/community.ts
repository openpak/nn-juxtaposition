import crypto from 'node:crypto';
import { getDb } from '@/database';
import { changedColumns, copyRow, definedOnly, isUniqueViolation } from '@/models/row';
import type { Prisma, Community as CommunityRow } from '@/prisma/client';
import type { ICommunity, ICommunityInput, ICommunityPermissions, IIconPaths } from '@/types/models/community';
import type { CommunityData } from '@/types/miiverse/community';

/* Communities live in the Postgres table `communities` (the Mongo `communities` collection until
 * card openpak/prds#20). The Mongo documents had two nested objects, `permissions` and `icon_paths`;
 * the table keeps them as plain columns and a CommunityDocument folds them back, so the code still
 * reads `community.permissions.open` and `community.icon_paths?.[32]`. Queries (`where`) use the
 * column names. */

const defaultPermissions: ICommunityPermissions = {
	open: true,
	minimum_new_post_access_level: 0,
	minimum_new_comment_access_level: 0,
	minimum_new_community_access_level: 3
};

type NestedPatch = {
	permissions?: Partial<ICommunityPermissions>;
	icon_paths?: IIconPaths | null;
};

/** The nested objects as row columns (only the keys given) */
function flattenNested(patch: NestedPatch): Partial<CommunityRow> {
	const out: Partial<CommunityRow> = {};
	if (patch.permissions) {
		const p = patch.permissions;
		Object.assign(out, definedOnly({
			permissions_open: p.open,
			minimum_new_post_access_level: p.minimum_new_post_access_level,
			minimum_new_comment_access_level: p.minimum_new_comment_access_level,
			minimum_new_community_access_level: p.minimum_new_community_access_level
		}));
	}
	if (patch.icon_paths !== undefined) {
		const i = patch.icon_paths;
		Object.assign(out, {
			icon_path_32: i?.[32] ?? null,
			icon_path_48: i?.[48] ?? null,
			icon_path_64: i?.[64] ?? null,
			icon_path_96: i?.[96] ?? null,
			icon_path_128: i?.[128] ?? null
		});
	}
	return out;
}

/** A community-shaped object (nested objects) as row columns. Unknown keys are not passed through. */
export function communityToColumns(c: Partial<ICommunity> & NestedPatch): Partial<CommunityRow> {
	const { permissions, icon_paths, ...rest } = c as Partial<ICommunity> & NestedPatch & Record<string, unknown>;
	return { ...definedOnly(rest) as Partial<CommunityRow>, ...flattenNested({ permissions, icon_paths }) };
}

function nestedOf(row: CommunityRow): Pick<ICommunity, 'permissions' | 'icon_paths'> {
	return {
		permissions: {
			open: row.permissions_open,
			minimum_new_post_access_level: row.minimum_new_post_access_level,
			minimum_new_comment_access_level: row.minimum_new_comment_access_level,
			minimum_new_community_access_level: row.minimum_new_community_access_level
		},
		icon_paths: row.icon_path_32 !== null
			? {
					32: row.icon_path_32,
					48: row.icon_path_48 ?? '',
					64: row.icon_path_64 ?? '',
					96: row.icon_path_96 ?? '',
					128: row.icon_path_128 ?? ''
				}
			: null
	};
}

const nestedColumns = new Set(['permissions_open', 'minimum_new_post_access_level', 'minimum_new_comment_access_level', 'minimum_new_community_access_level', 'icon_path_32', 'icon_path_48', 'icon_path_64', 'icon_path_96', 'icon_path_128']);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the interface only types the row columns the constructor copies in
export interface CommunityDocument extends ICommunity {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the interface only types the row columns the constructor copies in
export class CommunityDocument {
	#saved: CommunityRow;

	constructor(row: CommunityRow) {
		for (const [key, value] of Object.entries(row)) {
			if (!nestedColumns.has(key)) {
				(this as unknown as Record<string, unknown>)[key] = Array.isArray(value) ? [...value] : value;
			}
		}
		Object.assign(this, nestedOf(row));
		this.#saved = copyRow(row);
	}

	/** The row columns as this object has them now */
	toRow(): CommunityRow {
		const plain = {} as Record<string, unknown>;
		for (const key of Object.keys(this.#saved)) {
			if (!nestedColumns.has(key)) {
				plain[key] = (this as unknown as Record<string, unknown>)[key];
			}
		}
		return { ...plain, ...flattenNested({ permissions: this.permissions, icon_paths: this.icon_paths }) } as CommunityRow;
	}

	/** The community in its Mongo-era shape (nested permissions and icon_paths) */
	toJSON(): ICommunity {
		const out = {} as Record<string, unknown>;
		for (const key of Object.keys(this)) {
			out[key] = (this as unknown as Record<string, unknown>)[key];
		}
		return out as ICommunity;
	}

	/** Writes the columns changed since the row was read */
	async save(): Promise<this> {
		const changes = changedColumns(this.#saved, this.toRow());
		delete changes.community_id;
		if (Object.keys(changes).length > 0) {
			await getDb().community.update({ where: { community_id: this.#saved.community_id }, data: changes });
			this.#saved = copyRow(this.toRow());
		}
		return this;
	}

	async addUserFavorite(pid: number): Promise<void> {
		await getDb().$executeRaw`
			UPDATE communities SET user_favorites = array_append(coalesce(user_favorites, '{}'), ${pid}::int)
			WHERE community_id = ${this.community_id} AND NOT (${pid}::int = ANY(coalesce(user_favorites, '{}')))`;
		if (!this.user_favorites.includes(pid)) {
			this.user_favorites.push(pid);
		}
		this.#saved.user_favorites = [...this.user_favorites];
	}

	async delUserFavorite(pid: number): Promise<void> {
		await getDb().$executeRaw`
			UPDATE communities SET user_favorites = array_remove(user_favorites, ${pid}::int)
			WHERE community_id = ${this.community_id}`;
		this.user_favorites = this.user_favorites.filter(v => v !== pid);
		this.#saved.user_favorites = [...this.user_favorites];
	}

	json(): CommunityData {
		return {
			community_id: this.community_id,
			name: this.name,
			description: this.description,
			icon: this.icon.replace(/[^A-Za-z0-9+/=\s]/g, ''),
			icon_3ds: '',
			pid: this.owner ?? 0,
			app_data: this.app_data.replace(/[^A-Za-z0-9+/=\s]/g, ''),
			is_user_community: '0'
		};
	}
}

export type CommunityFindOptions = {
	orderBy?: Prisma.CommunityOrderByWithRelationInput | Prisma.CommunityOrderByWithRelationInput[];
	skip?: number;
	take?: number;
};

function hydrate(row: CommunityRow): CommunityDocument {
	return new CommunityDocument(row);
}

export const Community = {
	hydrate,

	async findOne(where: Prisma.CommunityWhereInput, opts: CommunityFindOptions = {}): Promise<CommunityDocument | null> {
		const row = await getDb().community.findFirst({ where, ...opts });
		return row ? hydrate(row) : null;
	},

	async find(where: Prisma.CommunityWhereInput = {}, opts: CommunityFindOptions = {}): Promise<CommunityDocument[]> {
		const rows = await getDb().community.findMany({ where, ...opts });
		return rows.map(hydrate);
	},

	async count(where: Prisma.CommunityWhereInput = {}): Promise<number> {
		return getDb().community.count({ where });
	},

	async exists(where: Prisma.CommunityWhereInput): Promise<boolean> {
		return (await getDb().community.findFirst({ where, select: { community_id: true } })) !== null;
	},

	/** Inserts a community. A taken community_id / olive_community_id throws a P2002 error. */
	async create(input: ICommunityInput): Promise<CommunityDocument> {
		const { permissions, icon_paths, ...rest } = input;
		const data = {
			...definedOnly(rest),
			...flattenNested({ permissions: { ...defaultPermissions, ...permissions }, icon_paths: icon_paths ?? null })
		} as Prisma.CommunityUncheckedCreateInput;
		return hydrate(await getDb().community.create({ data }));
	},

	/** Updates the community with this olive id and returns it, or null when there is none */
	async updateOne(where: { olive_community_id: string }, patch: Partial<ICommunity> & NestedPatch): Promise<CommunityDocument | null> {
		const data = communityToColumns(patch);
		delete data.community_id;
		const res = await getDb().community.updateMany({ where, data });
		return res.count > 0 ? Community.findOne(where) : null;
	},

	async deleteOne(where: Prisma.CommunityWhereInput): Promise<number> {
		const row = await getDb().community.findFirst({ where, select: { community_id: true } });
		if (!row) {
			return 0;
		}
		return (await getDb().community.deleteMany({ where: { community_id: row.community_id } })).count;
	},

	/** Takes pids out of every community's favourites and admins and drops them as owner (account erasure) */
	async forgetPids(pids: number[]): Promise<number> {
		let rows = 0;
		for (const pid of pids) {
			rows += await getDb().$executeRaw`
				UPDATE communities SET user_favorites = array_remove(user_favorites, ${pid}::int)
				WHERE ${pid}::int = ANY(user_favorites)`;
			rows += await getDb().$executeRaw`
				UPDATE communities SET admins = array_remove(admins, ${pid}::int)
				WHERE ${pid}::int = ANY(admins)`;
		}
		rows += (await getDb().community.updateMany({ where: { owner: { in: pids } }, data: { owner: null } })).count;
		return rows;
	}
};

export async function tryCreateCommunity(community: Omit<ICommunityInput, 'community_id' | 'olive_community_id'>, attempts: number = 0): Promise<CommunityDocument> {
	// If we're in too deep bail out
	if (attempts > 10) {
		throw new Error('Community creation failed - ID space exhausted?');
	}

	// Community ID is a random 32-bit int, but ensure larger than 524288. Values lower than this
	// are reserved for game-specific hardcoding
	const community_id = crypto.randomInt(0x80000, 0xFFFFFFFF).toString();
	// Olive community ID is random 64-bit, but some games (MK8?) seem to prefer if the top bit is set
	const olive_community_id = (crypto.randomBytes(8).readBigUInt64BE(0) | (1n << 63n)).toString();

	try {
		return await Community.create({
			community_id,
			olive_community_id,
			...community
		});
	} catch (err) {
		// Duplicate key: roll again
		if (isUniqueViolation(err)) {
			return tryCreateCommunity(community, attempts + 1);
		}
		throw err;
	}
}
