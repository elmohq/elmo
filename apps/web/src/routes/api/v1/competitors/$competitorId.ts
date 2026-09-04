/**
 * /api/v1/competitors/:competitorId — single competitor resource.
 *
 * GET     fetch one competitor
 * PATCH   update name / domains / aliases (replace semantics on arrays)
 * DELETE  remove the competitor (returns the deleted competitor)
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { dedupeAliases, dedupeDomains } from "@workspace/lib/citations/domain-categories";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";
import { requestBrandReprocess } from "@/lib/job-scheduler";

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

/**
 * Load a competitor the caller may reach. A competitor belonging to another
 * tenant reads exactly like one that does not exist.
 */
async function loadInScope(auth: Parameters<typeof isBrandInScope>[0], competitorId: string) {
	const row = await db.query.competitors.findFirst({ where: eq(competitors.id, competitorId) });
	if (!row || !(await isBrandInScope(auth, row.brandId))) {
		throw new ApiError(404, "Not Found", `Competitor with ID '${competitorId}' not found`);
	}
	return row;
}

export const Route = createFileRoute("/api/v1/competitors/$competitorId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: competitorParams,
				scopes: ["competitors:read"],
				handle: async ({ params, auth }) => {
					return await loadInScope(auth, params.competitorId);
				},
			}),

			PATCH: createApiHandler({
				params: competitorParams,
				body: updateCompetitorBody,
				scopes: ["competitors:write"],
				handle: async ({ params, body, auth }) => {
					await loadInScope(auth, params.competitorId);
					const { competitorId } = params;

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
					await requestBrandReprocess(updated.brandId);
					return updated;
				},
			}),

			DELETE: createApiHandler({
				params: competitorParams,
				scopes: ["competitors:delete"],
				handle: async ({ params, auth }) => {
					await loadInScope(auth, params.competitorId);
					const [deleted] = await db.delete(competitors).where(eq(competitors.id, params.competitorId)).returning();
					if (!deleted) {
						throw new ApiError(404, "Not Found", `Competitor with ID '${params.competitorId}' not found`);
					}
					await requestBrandReprocess(deleted.brandId);
					return deleted;
				},
			}),
		}),
	},
});
