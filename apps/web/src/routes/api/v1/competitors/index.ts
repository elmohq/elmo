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
import { competitors, brands } from "@workspace/lib/db/schema";
import { eq, count, desc } from "drizzle-orm";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import { dedupeDomains, dedupeAliases } from "@/lib/domain-categories";

export const Route = createFileRoute("/api/v1/competitors/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const { searchParams } = new URL(request.url);
					const brandId = searchParams.get("brandId");
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
					const offset = (page - 1) * limit;

					const where = brandId ? eq(competitors.brandId, brandId) : undefined;

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

					return Response.json({
						competitors: list,
						pagination: { page, limit, total: totalCount, totalPages },
					});
				} catch (err) {
					console.error("[competitors GET] failed:", err);
					return Response.json({ error: "Internal Server Error" }, { status: 500 });
				}
			},

			POST: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				let body: any;
				try {
					body = await request.json();
				} catch {
					return Response.json(
						{ error: "Validation Error", message: "Request body must be valid JSON" },
						{ status: 400 },
					);
				}

				const { brandId, name, domains, aliases } = body ?? {};

				if (typeof brandId !== "string" || !brandId.trim()) {
					return Response.json(
						{ error: "Validation Error", message: "brandId is required" },
						{ status: 400 },
					);
				}
				if (typeof name !== "string" || !name.trim()) {
					return Response.json(
						{ error: "Validation Error", message: "name must be a non-empty string" },
						{ status: 400 },
					);
				}
				if (domains !== undefined && !Array.isArray(domains)) {
					return Response.json(
						{ error: "Validation Error", message: "domains must be an array of strings" },
						{ status: 400 },
					);
				}
				if (aliases !== undefined && !Array.isArray(aliases)) {
					return Response.json(
						{ error: "Validation Error", message: "aliases must be an array of strings" },
						{ status: 400 },
					);
				}

				try {
					const brandRow = await db.query.brands.findFirst({ where: eq(brands.id, brandId.trim()) });
					if (!brandRow) {
						return Response.json(
							{ error: "Validation Error", message: `Brand with ID '${brandId}' not found` },
							{ status: 400 },
						);
					}

					const [{ count: currentCount }] = await db
						.select({ count: count() })
						.from(competitors)
						.where(eq(competitors.brandId, brandId.trim()));
					if ((currentCount || 0) + 1 > MAX_COMPETITORS) {
						return Response.json(
							{
								error: "Conflict",
								message: `Brand already has ${currentCount}/${MAX_COMPETITORS} competitors. Delete one before adding another.`,
							},
							{ status: 409 },
						);
					}

					const cleanedDomains = dedupeDomains((domains as string[]) ?? []);
					const cleanedAliases = dedupeAliases((aliases as string[]) ?? []);

					const [inserted] = await db
						.insert(competitors)
						.values({
							brandId: brandId.trim(),
							name: name.trim(),
							domains: cleanedDomains,
							aliases: cleanedAliases,
						})
						.returning();

					return Response.json(inserted, { status: 201 });
				} catch (err) {
					console.error("[competitors POST] failed:", err);
					const message = err instanceof Error ? err.message : "Failed to create competitor";
					return Response.json({ error: "Internal Server Error", message }, { status: 500 });
				}
			},
		},
	},
});
