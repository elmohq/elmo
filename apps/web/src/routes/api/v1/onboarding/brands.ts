/**
 * POST /api/v1/onboarding/brands
 *
 * Programmatic brand creation for white-label deployments. Pure create — fails
 * with 409 if a brand row with this brandId already exists. Use
 * PATCH /api/v1/onboarding/brands/:brandId to top up an existing brand.
 *
 * Body (all fields except brandId / brandName / website are optional):
 * {
 *   "brandId": "acme",
 *   "brandName": "Acme",
 *   "website": "acme.com",
 *   "additionalDomains": ["acme.co.uk"],
 *   "aliases": ["acme inc"],
 *   "competitors": [{ "name": "Globex", "domains": ["globex.com"], "aliases": [] }],
 *   "prompts": [{ "value": "best widgets", "tags": ["best-of"] }],
 *   "generateCompetitors": true,   // default true; only runs if competitors not provided
 *   "generatePrompts": true        // default true; only runs if prompts not provided
 * }
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import {
	createOnboardedBrand,
	createOnboardedBrandInputSchema,
	BrandConflictError,
} from "@/server/onboarding";

export const Route = createFileRoute("/api/v1/onboarding/brands")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json(
						{ error: "Unauthorized", message: "Valid API key required" },
						{ status: 401 },
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

				const parsed = createOnboardedBrandInputSchema.safeParse(body);
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
					const result = await createOnboardedBrand(parsed.data);
					return Response.json(result, { status: 201 });
				} catch (err) {
					if (err instanceof BrandConflictError) {
						return Response.json(
							{ error: "Conflict", message: err.message },
							{ status: 409 },
						);
					}
					console.error("[onboarding.brands POST] failed:", err);
					const message = err instanceof Error ? err.message : "Onboarding failed";
					return Response.json(
						{ error: "Internal Server Error", message },
						{ status: 500 },
					);
				}
			},
		},
	},
});
