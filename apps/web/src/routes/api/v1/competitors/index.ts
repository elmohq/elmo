/**
 * /api/v1/competitors — competitor collection.
 *
 * GET    list competitors (paginated, filterable by brandId)
 * POST   create a competitor for a brand
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { allowedBrandIds, canAccessBrand } from "@/lib/api/scope";
import { dedupeAliases, dedupeDomains } from "@/lib/domain-categories";

const createCompetitorBody = z.object({
	brandId: z.string().trim().min(1, "brandId is required"),
	name: z.string().trim().min(1, "name must be a non-empty string"),
	domains: z.array(z.string()).optional(),
	aliases: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/v1/competitors/")({
	server: {
		handlers: {
			GET: createApiHandler({
				handle: async ({ request, auth }) => {
					const { searchParams } = new URL(request.url);
					const brandId = searchParams.get("brandId");
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
					const offset = (page - 1) * limit;

					// A brandId filter the caller can't access must answer exactly
					// like a nonexistent brandId does (an empty list), never a 404 —
					// existence of an out-of-scope brand must not leak.
					if (brandId && !canAccessBrand(auth, brandId)) {
						return {
							competitors: [],
							pagination: { page, limit, total: 0, totalPages: 0 },
						};
					}

					let where = brandId ? eq(competitors.brandId, brandId) : undefined;
					if (!brandId) {
						const scoped = allowedBrandIds(auth);
						// drizzle's inArray throws on an empty array, so a non-admin key
						// belonging to zero organizations must short-circuit to an empty
						// page instead of querying with `inArray(competitors.brandId, [])`.
						if (scoped !== null && scoped.length === 0) {
							return {
								competitors: [],
								pagination: { page, limit, total: 0, totalPages: 0 },
							};
						}
						if (scoped !== null) {
							where = inArray(competitors.brandId, scoped);
						}
					}

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

					return {
						competitors: list,
						pagination: { page, limit, total: totalCount, totalPages },
					};
				},
			}),

			POST: createApiHandler({
				body: createCompetitorBody,
				status: 201,
				handle: async ({ body, auth }) => {
					const { brandId, name, domains, aliases } = body;

					// Out-of-scope brandId must answer exactly like a nonexistent one
					// (400 Validation Error below), never a 404 — existence of an
					// out-of-scope brand must not leak.
					if (!canAccessBrand(auth, brandId)) {
						throw new ApiError(400, "Validation Error", `Brand with ID '${brandId}' not found`);
					}

					const brandRow = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
					if (!brandRow) {
						throw new ApiError(400, "Validation Error", `Brand with ID '${brandId}' not found`);
					}

					const [{ count: currentCount }] = await db
						.select({ count: count() })
						.from(competitors)
						.where(eq(competitors.brandId, brandId));
					if ((currentCount || 0) + 1 > MAX_COMPETITORS) {
						throw new ApiError(
							409,
							"Conflict",
							`Brand already has ${currentCount}/${MAX_COMPETITORS} competitors. Delete one before adding another.`,
						);
					}

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
		},
	},
});
