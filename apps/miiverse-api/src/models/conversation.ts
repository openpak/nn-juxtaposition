import { getDb } from '@/database';
import type { Conversation as ConversationRow, ConversationUser } from '@/prisma/client';

/* Console private-message conversations: the tables `conversations` and `conversation_users`
 * (the Mongo `conversations` collection, whose `users` array became conversation_users rows). */

export type { ConversationUser };

export type ConversationWithUsers = ConversationRow & { users: ConversationUser[] };

export class ConversationDocument {
	id: string;
	created_at: Date;
	last_updated: Date;
	message_preview: string;
	users: ConversationUser[];

	constructor(row: ConversationWithUsers) {
		this.id = row.id;
		this.created_at = row.created_at;
		this.last_updated = row.last_updated;
		this.message_preview = row.message_preview;
		this.users = row.users;
	}

	/** A new message: the preview changes and `pid` (the recipient) has something unread */
	async newMessage(message: string, pid: number): Promise<void> {
		this.last_updated = new Date();
		this.message_preview = message;
		await getDb().$transaction([
			getDb().conversation.update({ where: { id: this.id }, data: { last_updated: this.last_updated, message_preview: message } }),
			getDb().conversationUser.updateMany({ where: { conversation_id: this.id, pid }, data: { read: false } })
		]);
		for (const user of this.users) {
			if (user.pid === pid) {
				user.read = false;
			}
		}
	}

	async markAsRead(pid: number): Promise<void> {
		await getDb().conversationUser.updateMany({ where: { conversation_id: this.id, pid }, data: { read: true } });
		for (const user of this.users) {
			if (user.pid === pid) {
				user.read = true;
			}
		}
	}
}

export type HydratedConversationDocument = ConversationDocument;

export const Conversation = {
	/** The conversation both players are in */
	async findByUsers(a: number, b: number): Promise<ConversationDocument | null> {
		const row = await getDb().conversation.findFirst({
			where: { AND: [{ users: { some: { pid: a } } }, { users: { some: { pid: b } } }] },
			include: { users: true }
		});
		return row ? new ConversationDocument(row) : null;
	},

	async create(input: { id: string; users: { pid: number; official: boolean; read: boolean }[] }): Promise<ConversationDocument> {
		const row = await getDb().conversation.create({
			data: { id: input.id, users: { create: input.users } },
			include: { users: true }
		});
		return new ConversationDocument(row);
	},

	/** Deletes every conversation one of these players is in (account erasure) */
	async deleteWithUsers(pids: number[]): Promise<number> {
		return (await getDb().conversation.deleteMany({ where: { users: { some: { pid: { in: pids } } } } })).count;
	}
};
