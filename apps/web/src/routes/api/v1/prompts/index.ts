/**
 * /api/v1/prompts - External API endpoint for prompt management
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { allowedBrandIds, canAccessBrand } from "@/lib/api/scope";
import { createPromptJobScheduler } from "@/lib/job-scheduler";

const createPromptBody = z.object({
	brandId: z.string().trim().min(1, "brandId is required"),
	value: z.string().trim().min(1, "value must be a non-empty string"),
	tags: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/v1/prompts/")({
	server: {
		handlers: {
			GET: createApiHandler({
				handle: async ({ request, auth }) => {
					const { searchParams } = new URL(request.url);
					const brandId = searchParams.get("brandId");
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, parseInt(searchParams.get("limit") || "20"));
					const offset = (page - 1) * limit;

					// A brandId filter the caller can't access must answer exactly
					// like a nonexistent brandId does (an empty list), never a 404 —
					// existence of an out-of-scope brand must not leak.
					if (brandId && !canAccessBrand(auth, brandId)) {
						return {
							prompts: [],
							pagination: { page, limit, total: 0, totalPages: 0 },
						};
					}

					let whereConditions = brandId ? eq(prompts.brandId, brandId) : undefined;
					if (!brandId) {
						const scoped = allowedBrandIds(auth);
						// drizzle's inArray throws on an empty array, so a non-admin key
						// belonging to zero organizations must short-circuit to an empty
						// page instead of querying with `inArray(prompts.brandId, [])`.
						if (scoped !== null && scoped.length === 0) {
							return {
								prompts: [],
								pagination: { page, limit, total: 0, totalPages: 0 },
							};
						}
						if (scoped !== null) {
							whereConditions = inArray(prompts.brandId, scoped);
						}
					}

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
						.offset(offset);

					return {
						prompts: promptsList,
						pagination: { page, limit, total: totalCount, totalPages },
					};
				},
			}),

			POST: createApiHandler({
				body: createPromptBody,
				status: 201,
				handle: async ({ body, auth }) => {
					const { brandId, value, tags } = body;

					// Out-of-scope brandId must answer exactly like a nonexistent one
					// (400 Validation Error below), never a 404 — existence of an
					// out-of-scope brand must not leak.
					if (!canAccessBrand(auth, brandId)) {
						throw new ApiError(400, "Validation Error", `Brand with ID '${brandId}' not found`);
					}

					const brandInfo = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
					if (brandInfo.length === 0) {
						throw new ApiError(400, "Validation Error", `Brand with ID '${brandId}' not found`);
					}

					const brand = brandInfo[0];
					const userTags = tags ? sanitizeUserTags(tags) : [];
					const systemTags = computeSystemTags(value, brand.name, brand.website);

					const [newPrompt] = await db
						.insert(prompts)
						.values({ brandId, value, tags: userTags, systemTags, enabled: true })
						.returning();

					await createPromptJobScheduler(newPrompt.id);

					return newPrompt;
				},
			}),
		},
	},
});
