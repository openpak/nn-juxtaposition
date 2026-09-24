// OpenPak chat bridge (platform-wiiu-prd WU-4): the join between Miiverse
// messages and the neutral chat store. Outbound only today: a message a
// console posts here is forwarded to the chat service, so it shows up on the
// website, the phone and every other surface the store feeds. The inbound
// direction (a phone message appearing in this feed) is specified in the PRD
// and lands when it can be tested against a console; this file deliberately
// never mutates Miiverse state, so every failure here degrades to "the
// message stays console-local", never to a broken feed.
import { config } from '@/config';
import { LOG_ERROR, LOG_WARN } from '@/logger';
import { Post } from '@/models/post';

interface ResolvedPid {
	found: boolean;
	account_id?: string;
}

/// Whether the bridge has somewhere to send anything.
export function chatBridgeEnabled(): boolean {
	return config.openpak.chatUrl !== '' && config.openpak.nnasUrl !== '';
}

async function resolvePid(pid: number): Promise<string | null> {
	const url = `${config.openpak.nnasUrl}/internal/resolve/pid?namespace=wiiu&pid=${pid}`;
	const response = await fetch(url, {
		headers: { 'X-Internal-Key': config.openpak.nnasKey }
	});
	if (!response.ok) {
		throw new Error(`resolve pid ${pid}: ${response.status}`);
	}
	return ((await response.json()) as ResolvedPid).account_id ?? null;
}

/// What the neutral store carries for this post: the text, or a named kind
/// with its payload. The store's own rules cap the size; a too-big payload is
/// refused there and we log it here.
function chatPayload(post: InstanceType<typeof Post>): { kind: string; body: string } {
	if (post.body) {
		return { kind: 'text', body: post.body };
	}
	if (post.painting) {
		return { kind: 'painting', body: post.painting };
	}
	if (post.screenshot) {
		return { kind: 'screenshot', body: post.screenshot };
	}
	if (post.app_data) {
		return { kind: 'app_data', body: post.app_data };
	}
	return { kind: 'text', body: '' };
}

/// Forward one stored message to the chat store. Fire-and-forget by policy:
/// the caller does not await this on the console's path.
export async function forwardMessageToOpenPakChat(post: InstanceType<typeof Post>, senderPid: number, recipientPid: number): Promise<void> {
	if (!chatBridgeEnabled()) {
		return;
	}
	try {
		const [from, to] = await Promise.all([resolvePid(senderPid), resolvePid(recipientPid)]);
		if (!from || !to) {
			// An identity the adapter does not stand behind (device-only or
			// unlinked): nothing to join to, and not an error.
			LOG_WARN(`[OpenPak chat] message ${post.id}: unresolved pid ${!from ? senderPid : recipientPid}, not forwarded`);
			return;
		}
		const { kind, body } = chatPayload(post);
		const response = await fetch(`${config.openpak.chatUrl}/internal/accounts/${from}/messages/${to}`, {
			method: 'POST',
			headers: {
				'X-Internal-Key': config.openpak.chatKey,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ body, kind, dedup_key: String(post.id) })
		});
		if (!response.ok) {
			LOG_ERROR(`[OpenPak chat] message ${post.id}: chat refused (${response.status})`);
		}
	} catch (err) {
		LOG_ERROR(`[OpenPak chat] message ${post.id}: ${err}`);
	}
}
