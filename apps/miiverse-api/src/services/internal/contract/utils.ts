import { z } from 'zod';
import { asOpenapi } from '@/services/internal/builder/openapi';
import type { Prisma } from '@/prisma/client';

export const standardSortSchema = z.enum(['newest', 'oldest']).default('newest').openapi('StandardSortEnum');
export type StandardSortEnum = z.infer<typeof standardSortSchema>;

export function standardSortToDirection(sort: StandardSortEnum): 'desc' | 'asc' {
	return sort === 'newest' ? 'desc' : 'asc';
}

export const postTypeFilter = asOpenapi('PostTypeFilter', z.enum(['post', 'reply', 'all']));
export type PostTypeFilterEnum = z.infer<typeof postTypeFilter>;

export function getPostTypeFilter(filter: PostTypeFilterEnum): Prisma.PostWhereInput {
	if (filter === 'post') {
		return { parent: null };
	}
	if (filter === 'reply') {
		return { parent: { not: null } };
	}
	return {};
}
