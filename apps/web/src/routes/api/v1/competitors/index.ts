/**
 * /api/v1/competitors — competitor collection.
 *
 * GET    list competitors (paginated, filterable by brandId)
 * POST   create a competitor for a brand
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { dedupeAliases, dedupeDomains } from "@workspace/lib/citations/domain-categories";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { assertCompetitorCap } from "@workspace/lib/entitlements";
import { z } from "zod";
import { clampedPaging } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requestBrandReprocess } from "@/lib/job-scheduler";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import { listCompetitors } from "@/server/competitors-core";

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
					const { page, limit, offset } = clampedPaging(searchParams);

					const { data, total } = await listCompetitors({
						scope: await brandScopeCondition(auth, competitors.brandId),
						brandId: searchParams.get("brandId") ?? undefined,
						limit,
						offset,
					});

					// Both keys hold the same array while callers move to `data`, which
					// every list in this API answers with. `competitors` is documented
					// as deprecated and goes in a later release.
					return {
						data,
						competitors: data,
						pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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

					await requestBrandReprocess(brandId);
					return inserted;
				},
			}),
		}),
	},
});
