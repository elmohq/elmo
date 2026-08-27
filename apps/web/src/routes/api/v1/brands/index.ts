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
import { assertCanCreateBrand } from "@workspace/lib/entitlements";
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

					return {
						brands: rows.map(buildBrandResult),
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
					// An organization key creates inside its own workspace, whatever the
					// body says. An admin key may name one, and falls back to the
					// per-brand organization it has always provisioned.
					const organizationId = auth.kind === "organization" ? auth.organizationId : (body.organizationId ?? null);
					if (organizationId) await assertCanCreateBrand(organizationId);
					const internal = apiCreateInputToInternal(body);
					return await createBrand({ ...internal, organizationId });
				},
			}),
		}),
	},
});
