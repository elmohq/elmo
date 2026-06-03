/**
 * POST /api/v1/tools/analyze
 *
 * Run brand analysis without persisting anything. Returns suggested
 * additionalDomains, aliases, competitors, and prompts so the caller can
 * feed the result into POST /api/v1/brands themselves (or filter it first).
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";

export const Route = createFileRoute("/api/v1/tools/analyze")({
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
				const { website, brandName, maxCompetitors, maxPrompts } = parsed;

				if (!website || typeof website !== "string" || !website.trim()) {
					return Response.json(
						{ error: "Validation Error", message: "website is required" },
						{ status: 400 },
					);
				}
				if (maxCompetitors !== undefined && (typeof maxCompetitors !== "number" || !Number.isInteger(maxCompetitors) || maxCompetitors < 0)) {
					return Response.json(
						{ error: "Validation Error", message: "maxCompetitors must be a non-negative integer" },
						{ status: 400 },
					);
				}
				if (maxPrompts !== undefined && (typeof maxPrompts !== "number" || !Number.isInteger(maxPrompts) || maxPrompts < 0)) {
					return Response.json(
						{ error: "Validation Error", message: "maxPrompts must be a non-negative integer" },
						{ status: 400 },
					);
				}

				try {
					const suggestion = await analyzeBrand({
						website: website.trim(),
						brandName: typeof brandName === "string" ? brandName.trim() : undefined,
						maxCompetitors: typeof maxCompetitors === "number" ? maxCompetitors : 20,
						maxPrompts: typeof maxPrompts === "number" ? maxPrompts : undefined,
					});
					return Response.json(suggestion);
				} catch (err) {
					console.error("[tools.analyze] failed:", err);
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
