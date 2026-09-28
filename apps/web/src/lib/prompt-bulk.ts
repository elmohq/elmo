import { z } from "zod";

/** Most prompt ids one selection, and therefore one bulk request, may carry: the whole brand cap. */
export const MAX_BULK_SELECTION = 10_000;

/**
 * Most prompts one delete commit may take. Measured on a restored copy of
 * production with two answers, three citations and a full sentiment graph per
 * prompt (migration 0027 indexes in place): 1 000 prompts delete in ≈1.8 s,
 * 5 000 in ≈7 s, 10 000 in ≈14 s — all inside one transaction that holds the
 * brand's insert lock. Five thousand keeps that lock, and the request, under
 * ten seconds on the production VM; a larger selection is two operations.
 */
export const MAX_DELETE_BATCH = 5_000;

export const promptIdListSchema = z
	.array(z.string().uuid())
	.min(1)
	.max(MAX_BULK_SELECTION)
	.transform((ids) => [...new Set(ids)]);

export function deletePhrase(count: number): string {
	return `DELETE ${count} PROMPTS`;
}

export function removeTagPhrase(tag: string): string {
	return `REMOVE ${tag}`;
}
