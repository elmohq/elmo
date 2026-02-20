/**
 * /api/v1/prompts - External API endpoint for prompt management
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { prompts, brands } from "@workspace/lib/db/schema";
import { eq, count, desc } from "drizzle-orm";
import { sanitizeUserTags, computeSystemTags } from "@workspace/lib/tag-utils";
import { createPromptJobScheduler } from "@/lib/job-scheduler";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";

export const Route = createFileRoute("/api/v1/prompts/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const { searchParams } = new URL(request.url);
					const brandId = searchParams.get("brandId");
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, parseInt(searchParams.get("limit") || "20"));
					const offset = (page - 1) * limit;

					const whereConditions = brandId ? eq(prompts.brandId, brandId) : undefined;

					const [totalCountResult] = await db.select({ count: count() }).from(prompts).where(whereConditions);
					const totalCount = totalCountResult?.count || 0;
					const totalPages = Math.ceil(totalCount / limit);

					const promptsList = await db
						.select({
							id: prompts.id,
							brandId: prompts.brandId,
							value: prompts.value,
							enabled: prompts.enabled,
							tags: prompts.tags,
							systemTags: prompts.systemTags,
							createdAt: prompts.createdAt,
							updatedAt: prompts.updatedAt,
						})
						.from(prompts)
						.where(whereConditions)
						.orderBy(desc(prompts.createdAt))
						.limit(limit)
						.offset(offset)

					return Response.json({
						prompts: promptsList,
						pagination: { page, limit, total: totalCount, totalPages },
					})
				} catch (error) {
					console.error("Error fetching prompts:", error);
					return Response.json({ error: "Internal Server Error" }, { status: 500 });
				}
			},

			POST: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const body = await request.json();
					const { brandId, value, tags } = body;

					if (!brandId || !value) {
						return Response.json({ error: "Validation Error", message: "brandId and value are required" }, { status: 400 });
					}

					if (typeof value !== "string" || value.trim().length === 0) {
						return Response.json({ error: "Validation Error", message: "value must be a non-empty string" }, { status: 400 });
					}

					if (tags !== undefined && !Array.isArray(tags)) {
						return Response.json({ error: "Validation Error", message: "tags must be an array of strings" }, { status: 400 });
					}

					const brandInfo = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
					if (brandInfo.length === 0) {
						return Response.json({ error: "Validation Error", message: `Brand with ID '${brandId}' not found` }, { status: 400 });
					}

					const brand = brandInfo[0];
					const userTags = tags ? sanitizeUserTags(tags) : [];
					const systemTags = computeSystemTags(value.trim(), brand.name, brand.website);

					const [newPrompt] = await db
						.insert(prompts)
						.values({ brandId: brandId.trim(), value: value.trim(), tags: userTags, systemTags, enabled: true })
						.returning()

					await createPromptJobScheduler(newPrompt.id);

					return Response.json(newPrompt, { status: 201 });
				} catch (error) {
					console.error("Error creating prompt:", error);
					return Response.json({ error: "Internal Server Error" }, { status: 500 });
				}
			},
		},
	},
});
