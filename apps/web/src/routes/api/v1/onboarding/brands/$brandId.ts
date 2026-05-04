/**
 * PATCH /api/v1/onboarding/brands/:brandId
 *
 * Top up an existing brand with additional domains, aliases, competitors, or
 * prompts. Returns 404 if the brand doesn't exist — use
 * POST /api/v1/onboarding/brands to create a new one.
 *
 * Body (all fields optional):
 * {
 *   "brandName": "Acme",                  // updates the brand's name if provided
 *   "website": "acme.com",                // updates the brand's website if provided
 *   "additionalDomains": ["acme.co.uk"],  // merged into existing additionalDomains
 *   "aliases": ["acme inc"],              // merged into existing aliases
 *   "competitors": [...],                 // adds new competitors (deduped by domain overlap)
 *   "prompts": [...],                     // adds new prompts (deduped by lowercased value)
 *   "generateCompetitors": false,         // default false; only runs if competitors not provided
 *   "generatePrompts": false              // default false; only runs if prompts not provided
 * }
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import {
	updateOnboardedBrand,
	updateOnboardedBrandBodySchema,
	BrandNotFoundError,
} from "@/server/onboarding";

function getBrandIdFromPath(request: Request): string {
	const segments = new URL(request.url).pathname.split("/").filter(Boolean);
	return decodeURIComponent(segments[segments.length - 1] || "");
}

export const Route = createFileRoute("/api/v1/onboarding/brands/$brandId")({
	server: {
		handlers: {
			PATCH: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json(
						{ error: "Unauthorized", message: "Valid API key required" },
						{ status: 401 },
					);
				}

				const brandId = getBrandIdFromPath(request);
				if (!brandId) {
					return Response.json(
						{ error: "Validation Error", message: "brandId path parameter is required" },
						{ status: 400 },
					);
				}

				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return Response.json(
						{ error: "Validation Error", message: "Request body must be valid JSON" },
						{ status: 400 },
					);
				}

				const parsed = updateOnboardedBrandBodySchema.safeParse(body);
				if (!parsed.success) {
					return Response.json(
						{
							error: "Validation Error",
							message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
						},
						{ status: 400 },
					);
				}

				try {
					const result = await updateOnboardedBrand({ brandId, ...parsed.data });
					return Response.json(result, { status: 200 });
				} catch (err) {
					if (err instanceof BrandNotFoundError) {
						return Response.json(
							{ error: "Not Found", message: err.message },
							{ status: 404 },
						);
					}
					console.error("[onboarding.brands PATCH] failed:", err);
					const message = err instanceof Error ? err.message : "Update failed";
					return Response.json(
						{ error: "Internal Server Error", message },
						{ status: 500 },
					);
				}
			},
		},
	},
});
