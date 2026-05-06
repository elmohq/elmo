/**
 * /api/v1/brands/:brandId — single brand resource.
 *
 * GET     fetch one brand
 * PATCH   update brand-level fields (replace semantics on arrays)
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import {
	updateBrand,
	updateBrandBodySchema,
	apiUpdateInputToInternal,
	buildBrandResult,
	BrandNotFoundError,
	InvalidDomainsError,
} from "@/server/onboarding-core";

export const Route = createFileRoute("/api/v1/brands/$brandId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				const { brandId } = params;

				try {
					const row = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
					if (!row) {
						return Response.json({ error: "Not Found", message: `Brand "${brandId}" not found.` }, { status: 404 });
					}
					return Response.json(buildBrandResult(row));
				} catch (err) {
					console.error("[brands GET one] failed:", err);
					return Response.json({ error: "Internal Server Error" }, { status: 500 });
				}
			},

			PATCH: async ({ request, params }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				const { brandId } = params;

				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return Response.json(
						{ error: "Validation Error", message: "Request body must be valid JSON" },
						{ status: 400 },
					);
				}

				const parsed = updateBrandBodySchema.safeParse(body);
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
					const internal = apiUpdateInputToInternal(brandId, parsed.data);
					const result = await updateBrand(internal);
					return Response.json(result, { status: 200 });
				} catch (err) {
					if (err instanceof InvalidDomainsError) {
						return Response.json({ error: "Validation Error", message: err.message }, { status: 400 });
					}
					if (err instanceof BrandNotFoundError) {
						return Response.json({ error: "Not Found", message: err.message }, { status: 404 });
					}
					console.error("[brands PATCH] failed:", err);
					const message = err instanceof Error ? err.message : "Failed to update brand";
					return Response.json({ error: "Internal Server Error", message }, { status: 500 });
				}
			},
		},
	},
});
