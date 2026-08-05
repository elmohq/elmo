/**
 * /api/v1/competitors/:competitorId — single competitor resource.
 *
 * GET     fetch one competitor
 * PATCH   update name / domains / aliases (replace semantics on arrays)
 * DELETE  remove the competitor in noncloud deployments (returns it)
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getOrganizationApiCompetitor, updateOrganizationApiCompetitor } from "@workspace/lib/cloud/api-resources";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { mapOrganizationResourceError } from "@/lib/api/organization-resources.server";
import { dedupeAliases, dedupeDomains } from "@/lib/domain-categories";

// z.guid(), not z.uuid(): matches the loose 8-4-4-4-12 hex check this API has
// always used; z.uuid() enforces RFC version bits and rejects existing IDs.
const competitorParams = z.object({ competitorId: z.guid("Invalid competitor ID format") });

const updateCompetitorBody = z
	.object({
		name: z.string().trim().min(1, "name must be a non-empty string").optional(),
		domains: z.array(z.string()).optional(),
		aliases: z.array(z.string()).optional(),
	})
	.refine((body) => Object.keys(body).length > 0, "At least one of name, domains, or aliases must be provided");

export const Route = createFileRoute("/api/v1/competitors/$competitorId")({
	server: {
		handlers: {
			GET: createApiHandler({
				cloudOrganizationScoped: true,
				params: competitorParams,
				mapError: mapOrganizationResourceError,
				handle: async ({ params, scope }) => {
					if (scope.kind === "organization") {
						return getOrganizationApiCompetitor(scope.organizationId, params.competitorId);
					}
					const row = await db.query.competitors.findFirst({ where: eq(competitors.id, params.competitorId) });
					if (!row) {
						throw new ApiError(404, "Not Found", `Competitor with ID '${params.competitorId}' not found`);
					}
					return row;
				},
			}),

			PATCH: createApiHandler({
				cloudOrganizationScoped: true,
				params: competitorParams,
				body: updateCompetitorBody,
				mapError: mapOrganizationResourceError,
				handle: async ({ params, body, scope }) => {
					const { competitorId } = params;
					if (scope.kind === "organization") {
						return updateOrganizationApiCompetitor({
							organizationId: scope.organizationId,
							competitorId,
							name: body.name,
							domains: body.domains === undefined ? undefined : dedupeDomains(body.domains),
							aliases: body.aliases === undefined ? undefined : dedupeAliases(body.aliases),
						});
					}

					const existing = await db.query.competitors.findFirst({ where: eq(competitors.id, competitorId) });
					if (!existing) {
						throw new ApiError(404, "Not Found", `Competitor with ID '${competitorId}' not found`);
					}

					const update: Partial<typeof competitors.$inferInsert> = {};
					if (body.name !== undefined) {
						update.name = body.name;
					}
					if (body.domains !== undefined) {
						update.domains = dedupeDomains(body.domains);
					}
					if (body.aliases !== undefined) {
						update.aliases = dedupeAliases(body.aliases);
					}

					const [updated] = await db
						.update(competitors)
						.set(update)
						.where(eq(competitors.id, competitorId))
						.returning();
					// The existence check above can race with a concurrent delete;
					// the update's returning() is the source of truth.
					if (!updated) {
						throw new ApiError(404, "Not Found", `Competitor with ID '${competitorId}' not found`);
					}
					return updated;
				},
			}),

			DELETE: createApiHandler({
				params: competitorParams,
				handle: async ({ params }) => {
					const [deleted] = await db.delete(competitors).where(eq(competitors.id, params.competitorId)).returning();
					if (!deleted) {
						throw new ApiError(404, "Not Found", `Competitor with ID '${params.competitorId}' not found`);
					}
					return deleted;
				},
			}),
		},
	},
});
