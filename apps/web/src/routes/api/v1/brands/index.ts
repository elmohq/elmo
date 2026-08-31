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
import { brands } from "@workspace/lib/db/schema";
import { assertCanCreateBrand, withQuotaLock } from "@workspace/lib/entitlements";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
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

					const filters: (SQL | undefined)[] = [await brandScopeCondition(auth, brands.id)];
					const enabled = searchParams.get("enabled");
					if (enabled === "true" || enabled === "false") {
						filters.push(eq(brands.enabled, enabled === "true"));
					}
					const query = searchParams.get("q")?.trim();
					if (query) {
						filters.push(or(ilike(brands.name, `%${query}%`), ilike(brands.id, `%${query}%`)));
					}
					const where = and(...filters.filter(Boolean));

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
					// every list in this API answers with. `brands` is documented as
					// deprecated and goes in a later release.
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
						// tenant holds. Worded as availability rather than existence: it
						// leaks that the id is taken and nothing about who took it.
						return new ApiError(409, "Conflict", `Brand id "${err.brandId}" is not available.`);
					}
				},
				handle: async ({ body, auth }) => {
					// An organization key creates inside its own workspace. Naming that
					// same workspace is fine — a client that fills the field in from
					// `GET /me` shouldn't be punished for it — but naming another is a
					// mistake worth reporting rather than silently ignoring.
					//
					// The check compares against the key's own org id and never looks
					// the named one up, so the refusal cannot reveal whether some other
					// tenant exists.
					if (auth.kind === "organization" && body.organizationId && body.organizationId !== auth.organizationId) {
						throw new ApiError(
							400,
							"Validation Error",
							"Organization keys always create inside their own organization; omit organizationId or set it to the key's organization.",
						);
					}
					const organizationId = auth.kind === "organization" ? auth.organizationId : (body.organizationId ?? null);
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
