function extractSearchKeywords(keyword: string): string[] {
	return keyword.trim().split(/\s+/);
}

type Expand<T> = {
	[K in keyof T]: T[K];
};
type PrismaCaseInsensitiveStringContains = {
	contains: string;
	mode: 'insensitive';
};
type PrismaSearchQuery<TFields extends string[]> = Expand<{
	OR: Array<{
		AND: Array<{
			[K in TFields[any]]?: PrismaCaseInsensitiveStringContains
		}>;
	}>;
}>;

export function buildPrismaSearchQuery<const TFields extends string[]>(fields: TFields, keyword: string): PrismaSearchQuery<TFields> {
	const terms = extractSearchKeywords(keyword);
	const result: PrismaSearchQuery<string[]> = {
		OR: fields.map(field => ({
			AND: terms.map(term => ({
				[field]: {
					contains: term,
					mode: 'insensitive'
				}
			}))
		}))
	};
	return result as PrismaSearchQuery<TFields>;
}
