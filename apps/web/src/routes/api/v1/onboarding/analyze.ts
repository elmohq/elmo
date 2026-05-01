/**
 * POST /api/v1/onboarding/analyze
 *
 * Run the provider-agnostic brand analysis without persisting anything.
 * Returns the suggested products, additional brand domains, aliases,
 * competitors and prompts so the caller can render a review UI or do its
 * own filtering before posting to /api/v1/onboarding/brands.
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";

export const Route = createFileRoute("/api/v1/onboarding/analyze")({
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

				const parsed = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
				const { website, brandName, includeCompetitors, includePrompts, maxCompetitors, maxPrompts } = parsed;

				if (!website || typeof website !== "string" || !website.trim()) {
					return Response.json(
						{ error: "Validation Error", message: "website is required" },
						{ status: 400 },
					);
				}

				try {
					const suggestion = await analyzeBrand({
						website: website.trim(),
						brandName: typeof brandName === "string" ? brandName.trim() : undefined,
						includeCompetitors: includeCompetitors !== false,
						includePrompts: includePrompts !== false,
						maxCompetitors: typeof maxCompetitors === "number" ? maxCompetitors : undefined,
						maxPrompts: typeof maxPrompts === "number" ? maxPrompts : undefined,
					});
					return Response.json(suggestion);
				} catch (err) {
					console.error("[onboarding.analyze] failed:", err);
					const message = err instanceof Error ? err.message : "Analysis failed";
					return Response.json(
						{ error: "Internal Server Error", message },
						{ status: 500 },
					);
				}
			},
		},
	},
});
