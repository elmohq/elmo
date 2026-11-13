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
import { competitors } from "@workspace/lib/db/schema";
import { assertCompetitorCap, withQuotaLock } from "@workspace/lib/entitlements";
import { z } from "zod";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { offsetOf, paginationOf, paging } from "@/lib/api/query";
import { competitorSchema, competitorsListSchema } from "@/lib/api/schemas/competitors";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import { listCompetitors, toCompetitorSummary } from "@/server/competitors-core";

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
				response: competitorsListSchema,
				query: z.object({ brandId: z.string().optional(), ...paging }),
				scopes: ["read"],
				handle: async ({ query, auth }) => {
					const { data, total } = await listCompetitors({
						scope: await brandScopeCondition(auth, competitors.brandId),
						brandId: query.brandId,
						limit: query.limit,
						offset: offsetOf(query),
					});

					// Both keys hold the same array while callers move to `data`, which
					// every list in this API answers with. `competitors` is documented
					// as deprecated and goes in a later release.
					return {
						data,
						competitors: data,
						pagination: paginationOf(query, total),
					};
				},
			}),

			POST: createApiHandler({
				response: competitorSchema,
				body: createCompetitorBody,
				status: 201,
				scopes: ["write"],
				handle: async ({ body, auth }) => {
					const { brandId, name, domains, aliases } = body;

					const brand = await requireBrandInScope(auth, brandId, "body");

					// Check and insert under one lock: otherwise two requests on a
					// brand's last competitor slot both pass the check.
					return await withQuotaLock(brand.organizationId, async (tx) => {
						await assertCompetitorCap(brandId, 1, tx);

						const [inserted] = await tx
							.insert(competitors)
							.values({
								brandId,
								name,
								domains: dedupeDomains(domains ?? []),
								aliases: dedupeAliases(aliases ?? []),
							})
							.returning();

						return toCompetitorSummary(inserted);
					});
				},
			}),
		}),
	},
});
