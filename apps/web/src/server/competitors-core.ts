/**
 * Competitor reads, as the external surfaces publish them.
 *
 * Server-only and edge-agnostic. Tenancy is the caller's job — pass the `scope`
 * fragment from `brandScopeCondition` — so nothing here knows who is asking.
 */
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { and, count, desc, eq, type SQL } from "drizzle-orm";

const COMPETITOR_COLUMNS = {
	id: competitors.id,
	brandId: competitors.brandId,
	name: competitors.name,
	domains: competitors.domains,
	aliases: competitors.aliases,
	createdAt: competitors.createdAt,
	updatedAt: competitors.updatedAt,
} as const;

export type CompetitorSummary = {
	[K in keyof typeof COMPETITOR_COLUMNS]: (typeof competitors.$inferSelect)[K];
};

export interface ListCompetitorsFilters {
	/** Restricts to one brand; combine with `scope` for the tenancy rule. */
	brandId?: string;
	limit: number;
	offset: number;
	/** The caller's tenancy condition, from `brandScopeCondition`. */
	scope?: SQL;
}

export async function listCompetitors(
	filters: ListCompetitorsFilters,
): Promise<{ data: CompetitorSummary[]; total: number }> {
	const conditions: (SQL | undefined)[] = [filters.scope];
	if (filters.brandId) conditions.push(eq(competitors.brandId, filters.brandId));

	const where = and(...conditions.filter(Boolean));
	const [totals] = await db.select({ count: count() }).from(competitors).where(where);
	const data = await db
		.select(COMPETITOR_COLUMNS)
		.from(competitors)
		.where(where)
		.orderBy(desc(competitors.createdAt))
		.limit(filters.limit)
		.offset(filters.offset);

	return { data, total: totals?.count ?? 0 };
}
