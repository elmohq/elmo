/**
 * POST /api/v1/onboarding/brands
 *
 * Programmatic brand onboarding for white-label deployments. Creates the
 * brand row plus any prompts / competitors the caller asked for, optionally
 * generating those via the provider-agnostic onboarding pipeline.
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
 * Idempotent on `brandId` — re-posting will skip the brand insert and just
 * top up domains/aliases plus add new prompts/competitors that don't exist
 * yet.
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import {
	createOnboardedBrand,
	createOnboardedBrandInputSchema,
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
					console.error("[onboarding.brands] failed:", err);
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
