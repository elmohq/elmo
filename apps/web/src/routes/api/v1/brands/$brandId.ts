/**
 * /api/v1/brands/:brandId — single brand resource.
 *
 * GET     fetch one brand
 * PATCH   update brand-level fields (replace semantics on arrays)
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getOrganizationApiBrand, updateOrganizationApiBrand } from "@workspace/lib/cloud/api-resources";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { mapOrganizationResourceError, toOrganizationApiBrandUpdate } from "@/lib/api/organization-resources.server";
import {
	apiUpdateInputToInternal,
	BrandNotFoundError,
	buildBrandResult,
	InvalidDomainsError,
	updateBrand,
	updateBrandBodySchema,
} from "@/server/onboarding-core";

export const Route = createFileRoute("/api/v1/brands/$brandId")({
	server: {
		handlers: {
			// No params schema: brand IDs are caller-chosen strings (e.g. "acme"),
			// not UUIDs like the competitor/prompt/report routes validate.
			GET: createApiHandler({
				cloudOrganizationScoped: true,
				mapError: mapOrganizationResourceError,
				handle: async ({ params, scope }) => {
					const { brandId } = params;
					if (scope.kind === "organization") {
						return buildBrandResult(await getOrganizationApiBrand(scope.organizationId, brandId));
					}
					const row = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
					if (!row) {
						throw new ApiError(404, "Not Found", `Brand "${brandId}" not found.`);
					}
					return buildBrandResult(row);
				},
			}),

			PATCH: createApiHandler({
				cloudOrganizationScoped: true,
				body: updateBrandBodySchema.refine(
					(body) => Object.keys(body).length > 0,
					"At least one of brandName, domains, aliases, or enabled must be provided",
				),
				mapError: (err) => {
					const organizationError = mapOrganizationResourceError(err);
					if (organizationError) return organizationError;
					if (err instanceof InvalidDomainsError) {
						return new ApiError(400, "Validation Error", err.message);
					}
					if (err instanceof BrandNotFoundError) {
						return new ApiError(404, "Not Found", err.message);
					}
				},
				handle: async ({ params, body, scope }) => {
					const internal = apiUpdateInputToInternal(params.brandId, body);
					if (scope.kind === "organization") {
						const brand = await updateOrganizationApiBrand(
							toOrganizationApiBrandUpdate(scope.organizationId, internal),
						);
						return buildBrandResult(brand);
					}
					return await updateBrand(internal);
				},
			}),
		},
	},
});
