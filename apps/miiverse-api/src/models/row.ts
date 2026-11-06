/* Small helpers for the document classes (PostDocument, CommunityDocument): they keep the row as it
 * was read so save() writes only the columns the caller changed. A counter another request moved in
 * the meantime (empathy_count, reply_count) is therefore never overwritten with a stale value. */

function same(a: unknown, b: unknown): boolean {
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() === b.getTime();
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => same(v, b[i]));
	}
	return a === b;
}

/** The columns of `current` that differ from `saved` (only keys present in `saved` count). */
export function changedColumns<T extends object>(saved: T, current: T): Partial<T> {
	const out: Partial<T> = {};
	for (const key of Object.keys(saved) as (keyof T)[]) {
		if (!same(saved[key], current[key])) {
			out[key] = current[key];
		}
	}
	return out;
}

/** A deep enough copy of a row: arrays and dates are not shared with the live object. */
export function copyRow<T extends object>(row: T): T {
	const out = { ...row };
	for (const key of Object.keys(out) as (keyof T)[]) {
		const v = out[key];
		if (Array.isArray(v)) {
			out[key] = [...v] as T[keyof T];
		} else if (v instanceof Date) {
			out[key] = new Date(v.getTime()) as T[keyof T];
		}
	}
	return out;
}

/** Drops keys whose value is undefined, so Prisma applies the column default. */
export function definedOnly<T extends object>(obj: T): T {
	return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function isUniqueViolation(e: unknown): boolean {
	return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}
