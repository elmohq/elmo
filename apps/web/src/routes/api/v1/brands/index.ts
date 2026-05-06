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
import { count, desc } from "drizzle-orm";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import { createBrand, createBrandInputSchema, buildBrandResult, BrandConflictError } from "@/server/onboarding-core";

export const Route = createFileRoute("/api/v1/brands/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const { searchParams } = new URL(request.url);
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
					const offset = (page - 1) * limit;

					const [totalCountResult] = await db.select({ count: count() }).from(brands);
					const totalCount = totalCountResult?.count || 0;
					const totalPages = Math.ceil(totalCount / limit);

					const rows = await db
						.select()
						.from(brands)
						.orderBy(desc(brands.createdAt))
						.limit(limit)
						.offset(offset);

					return Response.json({
						brands: rows.map(buildBrandResult),
						pagination: { page, limit, total: totalCount, totalPages },
					});
				} catch (err) {
					console.error("[brands GET] failed:", err);
					return Response.json({ error: "Internal Server Error" }, { status: 500 });
				}
			},

			POST: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
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

				const parsed = createBrandInputSchema.safeParse(body);
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
					const result = await createBrand(parsed.data);
					return Response.json(result, { status: 201 });
				} catch (err) {
					if (err instanceof BrandConflictError) {
						return Response.json({ error: "Conflict", message: err.message }, { status: 409 });
					}
					console.error("[brands POST] failed:", err);
					const message = err instanceof Error ? err.message : "Failed to create brand";
					return Response.json({ error: "Internal Server Error", message }, { status: 500 });
				}
			},
		},
	},
});
