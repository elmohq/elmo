/** Tenancy is the caller's job: pass the `scope` fragment from
 * `brandScopeCondition`. */
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

type Competitor = typeof competitors.$inferSelect;

export type CompetitorSummary = {
	[K in keyof typeof COMPETITOR_COLUMNS]: Competitor[K];
};

export function toCompetitorSummary(competitor: Competitor): CompetitorSummary {
	return {
		id: competitor.id,
		brandId: competitor.brandId,
		name: competitor.name,
		domains: competitor.domains,
		aliases: competitor.aliases,
		createdAt: competitor.createdAt,
		updatedAt: competitor.updatedAt,
	};
}

export interface ListCompetitorsFilters {
	brandId?: string;
	limit?: number;
	offset?: number;
	scope?: SQL;
}

export async function listCompetitors(
	filters: ListCompetitorsFilters,
): Promise<{ data: CompetitorSummary[]; total: number }> {
	const conditions: (SQL | undefined)[] = [filters.scope];
	if (filters.brandId) conditions.push(eq(competitors.brandId, filters.brandId));

	const where = and(...conditions.filter(Boolean));
	const [totals] = await db.select({ count: count() }).from(competitors).where(where);
	let query = db
		.select(COMPETITOR_COLUMNS)
		.from(competitors)
		.where(where)
		.orderBy(desc(competitors.createdAt))
		.$dynamic();
	if (filters.limit !== undefined) query = query.limit(filters.limit).offset(filters.offset ?? 0);
	const data = await query;

	return { data, total: totals?.count ?? 0 };
}
