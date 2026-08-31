/**
 * /api/v1/competitors — competitor collection.
 *
 * GET    list competitors (paginated, filterable by brandId)
 * POST   create a competitor for a brand
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { assertCompetitorCap } from "@workspace/lib/entitlements";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import { dedupeAliases, dedupeDomains } from "@/lib/domain-categories";

const createCompetitorBody = z.object({
	brandId: z.string().trim().min(1, "brandId is required"),
	name: z.string().trim().min(1, "name must be a non-empty string"),
	domains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/v1/competitors/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["competitors:read"],
				handle: async ({ request, auth }) => {
					const { searchParams } = new URL(request.url);
					const brandId = searchParams.get("brandId");
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
					const offset = (page - 1) * limit;

					const filters: (SQL | undefined)[] = [await brandScopeCondition(auth, competitors.brandId)];
					if (brandId) filters.push(eq(competitors.brandId, brandId));
					const where = and(...filters.filter(Boolean));

					const [totalCountResult] = await db.select({ count: count() }).from(competitors).where(where);
					const totalCount = totalCountResult?.count || 0;
					const totalPages = Math.ceil(totalCount / limit);

					const list = await db
						.select({
							id: competitors.id,
							brandId: competitors.brandId,
							name: competitors.name,
							domains: competitors.domains,
							aliases: competitors.aliases,
							createdAt: competitors.createdAt,
							updatedAt: competitors.updatedAt,
						})
						.from(competitors)
						.where(where)
						.orderBy(desc(competitors.createdAt))
						.limit(limit)
						.offset(offset);

					// Both keys hold the same array while callers move to `data`, which
					// every list in this API answers with. `competitors` is documented
					// as deprecated and goes in a later release.
					return {
						data: list,
						competitors: list,
						pagination: { page, limit, total: totalCount, totalPages },
					};
				},
			}),

			POST: createApiHandler({
				body: createCompetitorBody,
				status: 201,
				scopes: ["competitors:write"],
				handle: async ({ body, auth }) => {
					const { brandId, name, domains, aliases } = body;

					await requireBrandInScope(auth, brandId, "body");

					await assertCompetitorCap(brandId, 1);

					const [inserted] = await db
						.insert(competitors)
						.values({
							brandId,
							name,
							domains: dedupeDomains(domains ?? []),
							aliases: dedupeAliases(aliases ?? []),
						})
						.returning();

					return inserted;
				},
			}),
		}),
	},
});
