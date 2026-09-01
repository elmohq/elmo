/**
 * /api/v1/brands — brand collection.
 *
 * GET    list brands (paginated)
 * POST   create a brand
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { brands, organization } from "@workspace/lib/db/schema";
import { assertCanCreateBrand, withQuotaLock } from "@workspace/lib/entitlements";
import { count, desc, eq } from "drizzle-orm";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { brandScopeCondition } from "@/lib/api/scope";
import {
	apiCreateInputToInternal,
	BrandConflictError,
	buildBrandResult,
	createBrand,
	createBrandInputSchema,
	InvalidDomainsError,
} from "@/server/onboarding-core";

export const Route = createFileRoute("/api/v1/brands/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["brands:read"],
				handle: async ({ request, auth }) => {
					const { searchParams } = new URL(request.url);
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
					const offset = (page - 1) * limit;

					const where = await brandScopeCondition(auth, brands.id);

					const [totalCountResult] = await db.select({ count: count() }).from(brands).where(where);
					const totalCount = totalCountResult?.count || 0;
					const totalPages = Math.ceil(totalCount / limit);

					const rows = await db
						.select()
						.from(brands)
						.where(where)
						.orderBy(desc(brands.createdAt))
						.limit(limit)
						.offset(offset);

					// Both keys hold the same array while callers move to `data`, which
					// every other list in this API answers with.
					const results = rows.map(buildBrandResult);
					return {
						data: results,
						brands: results,
						pagination: { page, limit, total: totalCount, totalPages },
					};
				},
			}),

			POST: createApiHandler({
				body: createBrandInputSchema,
				status: 201,
				scopes: ["brands:write"],
				mapError: (err) => {
					if (err instanceof InvalidDomainsError) {
						return new ApiError(400, "Validation Error", err.message);
					}
					if (err instanceof BrandConflictError) {
						// Brand ids are globally unique, so this fires for an id another
						// tenant holds. Worded as availability, which leaks that the id is
						// taken and nothing about who took it.
						return new ApiError(409, "Conflict", `Brand id "${err.brandId}" is not available.`);
					}
				},
				handle: async ({ body, auth }) => {
					// Naming its own organization is fine — a client filling the field
					// in from `GET /me` shouldn't be punished — but naming another is a
					// mistake worth reporting rather than ignoring.
					if (auth.kind === "organization" && body.organizationId && body.organizationId !== auth.organizationId) {
						throw new ApiError(
							400,
							"Validation Error",
							"Organization keys always create inside their own organization; omit organizationId or set it to the key's organization.",
						);
					}
					const organizationId = auth.kind === "organization" ? auth.organizationId : (body.organizationId ?? null);
					// Without this the miss surfaces as a foreign-key violation and a 500.
					if (auth.kind === "admin" && organizationId) {
						const [row] = await db
							.select({ id: organization.id })
							.from(organization)
							.where(eq(organization.id, organizationId))
							.limit(1);
						if (!row) {
							throw new ApiError(404, "Not Found", `Organization "${organizationId}" not found.`);
						}
					}
					const internal = apiCreateInputToInternal(body);
					if (!organizationId) return await createBrand({ ...internal, organizationId });
					// Check and create under one lock: otherwise two requests on an
					// organization's last brand slot both pass the check.
					return await withQuotaLock(organizationId, async (tx, afterCommit) => {
						await assertCanCreateBrand(organizationId, tx);
						return await createBrand({ ...internal, organizationId, conn: tx, afterCommit });
					});
				},
			}),
		}),
	},
});
