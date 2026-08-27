/**
 * /api/v1/brands/:brandId — single brand resource.
 *
 * GET     fetch one brand
 * PATCH   update brand-level fields (replace semantics on arrays)
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
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
				scopes: ["brands:read"],
				handle: async ({ params, auth }) => {
					return buildBrandResult(await requireBrandInScope(auth, params.brandId));
				},
			}),

			PATCH: createApiHandler({
				body: updateBrandBodySchema.refine(
					(body) => Object.keys(body).length > 0,
					"At least one of brandName, domains, aliases, or enabled must be provided",
				),
				mapError: (err) => {
					if (err instanceof InvalidDomainsError) {
						return new ApiError(400, "Validation Error", err.message);
					}
					if (err instanceof BrandNotFoundError) {
						return new ApiError(404, "Not Found", err.message);
					}
				},
				scopes: ["brands:write"],
				handle: async ({ params, body, auth }) => {
					// Out of scope reads as not-found, so a key can't discover another
					// tenant's brand by trying to write to it.
					await requireBrandInScope(auth, params.brandId);
					const internal = apiUpdateInputToInternal(params.brandId, body);
					return await updateBrand(internal);
				},
			}),
		},
	},
});
