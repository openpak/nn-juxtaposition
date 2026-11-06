import crypto from 'node:crypto';
import moment from 'moment';
import { getDb } from '@/database';
import { getInvalidPostRegex } from '@/util';
import { config } from '@/config';
import { deletePostMedia } from '@/services/cdn/media';
import { changedColumns, copyRow, definedOnly, isUniqueViolation } from '@/models/row';
import { FALLBACK_NAME, miiFaceUrl, resolveIdentities } from '@/services/identity/identity';
import { consoleName } from '@/services/profile-sync/profile-sync';
import type { Prisma } from '@/prisma/client';
import type { Identity } from '@/services/identity/identity';
import type { IPost, IPostInput } from '@/types/models/post';
import type { HydratedCommunityDocument } from '@/types/models/community';
import type { PostToJSONOptions } from '@/types/models/post-to-json-options';
import type { PostData, PostPainting, PostScreenshot, PostTopicTag } from '@/types/miiverse/post';

/* Posts live in the Postgres table `posts` (they were the Mongo `posts` collection until card
 * openpak/prds#20). A PostDocument is one row plus the methods the Mongoose document had, so the
 * route code reads and formats a post the same way as before. The author's name and Mii are not
 * stored: every PostDocument the Post facade hands out has screen_name / mii / mii_face_url filled
 * from the account core (services/identity). Counters (empathy_count, reply_count)
 * and the yeahs list are only changed with single SQL statements (Post.addEmpathy, Post.incrementReplies),
 * never by read-modify-write. */

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the interface only types the row columns the constructor copies in
export interface PostDocument extends IPost {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the interface only types the row columns the constructor copies in
export class PostDocument {
	#saved: IPost;

	/** The author's name, from the account core (not a column) */
	screen_name: string = FALLBACK_NAME;
	/** The author's Mii data, from the account core; '' when there is none (not a column) */
	mii: string = '';

	constructor(row: IPost, identity?: Identity) {
		Object.assign(this, row);
		this.#saved = copyRow(row);
		if (identity) {
			this.setIdentity(identity);
		}
	}

	setIdentity(identity: Identity): this {
		this.screen_name = identity.name;
		this.mii = identity.miiData;
		return this;
	}

	/** The author's face image for this post's feeling (derived, not a column) */
	get mii_face_url(): string {
		return miiFaceUrl(this.pid, this.feeling_id);
	}

	/** The plain row (what JSON.stringify and the GDPR export see) */
	toJSON(): IPost {
		const out = {} as Record<string, unknown>;
		for (const key of Object.keys(this.#saved)) {
			out[key] = (this as unknown as Record<string, unknown>)[key];
		}
		return out as IPost;
	}

	isModified(): boolean {
		return Object.keys(changedColumns(this.#saved, this.toJSON())).length > 0;
	}

	/** Writes the columns changed since the row was read */
	async save(): Promise<this> {
		const changes = changedColumns(this.#saved, this.toJSON());
		delete changes.id;
		if (Object.keys(changes).length > 0) {
			await getDb().post.update({ where: { id: this.#saved.id }, data: changes });
			this.#saved = copyRow(this.toJSON());
		}
		return this;
	}

	async deleteOne(): Promise<void> {
		await getDb().post.deleteMany({ where: { id: this.id } });
	}

	async del(reason: string, pid: number): Promise<void> {
		this.removed = true;
		this.removed_by = pid;
		this.removed_reason = reason;
		this.removed_at = new Date();
		// The row stays (moderation log, report history) but the content does not: the media files
		// are deleted from the bucket and the drawing blob is wiped, so nothing stays reachable.
		await deletePostMedia(this);
		this.painting = '';
		this.painting_img = '';
		this.painting_big = '';
		this.screenshot = '';
		this.screenshot_big = '';
		this.screenshot_thumb = '';
		await this.save();
	}

	cleanedBody(): string {
		return this.body ? this.body.replace(getInvalidPostRegex(), '').replace(/[\n\r]+/gm, '') : '';
	}

	cleanedMiiData(): string {
		return (this.mii ?? '').replace(/[^A-Za-z0-9+/=]/g, '').replace(/[\n\r]+/gm, '').trim();
	}

	cleanedPainting(): string | undefined {
		return this.painting?.replace(/[\n\r]+/gm, '').trim();
	}

	cleanedAppData(): string | undefined {
		return this.app_data?.replace(/[^A-Za-z0-9+/=]/g, '').replace(/[\n\r]+/gm, '').trim();
	}

	formatPainting(): PostPainting | undefined {
		if (this.painting) {
			return {
				format: 'tga',
				content: this.cleanedPainting()!,
				size: this.painting.length,
				url: `${config.cdnUrl}/paintings/${this.pid}/${this.id}.png`
			};
		}
	}

	formatScreenshot(): PostScreenshot | undefined {
		if (this.screenshot && this.screenshot_length) {
			return {
				size: this.screenshot_length,
				url: `${config.cdnUrl}${this.screenshot}`
			};
		}
	}

	formatTopicTag(): PostTopicTag | undefined {
		if (this.topic_tag?.trim()) {
			return {
				name: this.topic_tag,
				title_id: this.title_id ?? ''
			};
		}
	}

	json(options: PostToJSONOptions, community?: HydratedCommunityDocument): PostData {
		const post: PostData = {
			app_data: undefined, // TODO - I try to keep these fields in the real order they show up in, but idk where this one goes
			body: this.cleanedBody(),
			community_id: this.community_id, // TODO - This sucks
			country_id: this.country_id,
			created_at: moment(this.created_at).format('YYYY-MM-DD HH:MM:SS'),
			feeling_id: this.feeling_id ?? 0,
			id: this.id,
			is_autopost: this.is_autopost ? 1 : 0,
			is_community_private_autopost: this.is_community_private_autopost ? 1 : 0,
			is_spoiler: this.is_spoiler ? 1 : 0,
			is_app_jumpable: this.is_app_jumpable ? 1 : 0,
			empathy_count: this.empathy_count,
			language_id: this.language_id,
			mii: undefined, // * Conditionally set later
			mii_face_url: undefined, // * Conditionally set later
			number: 0,
			painting: this.formatPainting(),
			pid: this.pid,
			platform_id: this.platform_id ?? 1,
			region_id: this.region_id ?? 0,
			reply_count: this.reply_count,
			screen_name: consoleName(this.screen_name), // the console shows ten characters
			screenshot: this.formatScreenshot(),
			topic_tag: undefined, // * Conditionally set later
			title_id: this.title_id ?? ''
		};

		if (options.app_data) {
			post.app_data = this.cleanedAppData();
		}

		if (options.with_mii) {
			post.mii = this.cleanedMiiData();
			post.mii_face_url = this.mii_face_url;
		}

		if (options.topic_tag) {
			post.topic_tag = this.formatTopicTag();
		}

		if (community) {
			post.community_id = community.community_id;
		}

		// * Some sanity checks
		if (post.feeling_id > 5) {
			post.feeling_id = 0;
		}

		return post;
	}
}

/** A random post id; the caller inserts it (a unique violation means: roll again) */
export function randomPostUID(length: number): string {
	return Buffer.from(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(length * 2))), 'binary').toString('base64').replace(/[+/]/g, '').substring(0, length);
}

/** A post id no row has yet */
export async function generatePostUID(length: number): Promise<string> {
	for (;;) {
		const id = randomPostUID(length);
		if (!await Post.exists({ id })) {
			return id;
		}
	}
}

export type PostFindOptions = {
	orderBy?: Prisma.PostOrderByWithRelationInput | Prisma.PostOrderByWithRelationInput[];
	skip?: number;
	take?: number;
};

function hydrate(row: IPost): PostDocument {
	return new PostDocument(row);
}

/** Rows to documents, with every author's name and Mii looked up in one batch */
async function hydrateAll(rows: IPost[]): Promise<PostDocument[]> {
	const identities = await resolveIdentities(rows.map(r => r.pid));
	return rows.map(r => new PostDocument(r, identities.get(r.pid)));
}

async function hydrateOne(row: IPost | null): Promise<PostDocument | null> {
	return row ? (await hydrateAll([row]))[0]! : null;
}

export const Post = {
	hydrate,

	async findOne(where: Prisma.PostWhereInput, opts: PostFindOptions = {}): Promise<PostDocument | null> {
		return hydrateOne(await getDb().post.findFirst({ where, ...opts }));
	},

	async find(where: Prisma.PostWhereInput = {}, opts: PostFindOptions = {}): Promise<PostDocument[]> {
		return hydrateAll(await getDb().post.findMany({ where, ...opts }));
	},

	/** Rows without the identity lookup (erasure, media cleanup: nothing is shown) */
	async findRows(where: Prisma.PostWhereInput, opts: PostFindOptions = {}): Promise<IPost[]> {
		return getDb().post.findMany({ where, ...opts });
	},

	/** The newest post of each author matching `where`, newest first (the console's distinct_pid=1) */
	async findNewestPerAuthor(where: Prisma.PostWhereInput, take: number): Promise<PostDocument[]> {
		const rows = await getDb().post.findMany({
			where,
			distinct: ['pid'],
			orderBy: [{ created_at: 'desc' }],
			take
		});
		return hydrateAll(rows);
	},

	async count(where: Prisma.PostWhereInput = {}): Promise<number> {
		return getDb().post.count({ where });
	},

	async exists(where: Prisma.PostWhereInput): Promise<boolean> {
		return (await getDb().post.findFirst({ where, select: { id: true } })) !== null;
	},

	/** Inserts a post. Without an id a random one is picked, and picked again on a collision. */
	async create(input: IPostInput): Promise<PostDocument> {
		const data = definedOnly({ ...input }) as Prisma.PostUncheckedCreateInput;
		if (data.id) {
			return (await hydrateOne(await getDb().post.create({ data })))!;
		}
		for (let attempt = 0; attempt < 10; attempt++) {
			try {
				return (await hydrateOne(await getDb().post.create({ data: { ...data, id: randomPostUID(21) } })))!;
			} catch (e) {
				if (!isUniqueViolation(e)) {
					throw e;
				}
			}
		}
		throw new Error('Post creation failed - ID space exhausted?');
	},

	async deleteOne(where: { id: string }): Promise<number> {
		return (await getDb().post.deleteMany({ where: { id: where.id } })).count;
	},

	async deleteMany(where: Prisma.PostWhereInput): Promise<number> {
		return (await getDb().post.deleteMany({ where })).count;
	},

	async updateMany(where: Prisma.PostWhereInput, data: Prisma.PostUpdateManyMutationInput): Promise<number> {
		return (await getDb().post.updateMany({ where, data })).count;
	},

	/** reply_count += by, in one statement */
	async incrementReplies(id: string, by: number): Promise<void> {
		await getDb().post.updateMany({ where: { id }, data: { reply_count: { increment: by } } });
	},

	/** Adds pid's yeah once. Returns the updated post, or null when it had one already (or no such post). */
	async addEmpathy(id: string, pid: number): Promise<PostDocument | null> {
		const rows = await getDb().$queryRaw<IPost[]>`
			UPDATE posts SET yeahs = array_append(coalesce(yeahs, '{}'), ${pid}::int), empathy_count = empathy_count + 1
			WHERE id = ${id} AND NOT (${pid}::int = ANY(coalesce(yeahs, '{}')))
			RETURNING id`;
		return rows.length > 0 ? Post.findOne({ id }) : null;
	},

	/** Takes pid's yeah back. Returns the updated post, or null when it had none (or no such post). */
	async removeEmpathy(id: string, pid: number): Promise<PostDocument | null> {
		const rows = await getDb().$queryRaw<IPost[]>`
			UPDATE posts SET yeahs = array_remove(yeahs, ${pid}::int), empathy_count = GREATEST(empathy_count - 1, 0)
			WHERE id = ${id} AND ${pid}::int = ANY(yeahs)
			RETURNING id`;
		return rows.length > 0 ? Post.findOne({ id }) : null;
	},

	/** Takes pid's yeahs back from every post (account erasure). Returns the posts changed. */
	async removeEmpathiesBy(pid: number): Promise<number> {
		return getDb().$executeRaw`
			UPDATE posts SET yeahs = array_remove(yeahs, ${pid}::int), empathy_count = GREATEST(empathy_count - 1, 0)
			WHERE ${pid}::int = ANY(yeahs)`;
	}
};
