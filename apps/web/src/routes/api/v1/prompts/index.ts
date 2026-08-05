/**
 * /api/v1/prompts - External API endpoint for prompt management
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createOrganizationApiPrompt, listOrganizationApiPrompts } from "@workspace/lib/cloud/api-resources";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { mapOrganizationResourceError } from "@/lib/api/organization-resources.server";
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
				cloudOrganizationScoped: true,
				handle: async ({ request, scope }) => {
					const { searchParams } = new URL(request.url);
					const brandId = searchParams.get("brandId");
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const requestedLimit = Math.max(1, parseInt(searchParams.get("limit") || "20"));
					const limit = scope.kind === "organization" ? Math.min(100, requestedLimit) : requestedLimit;
					const offset = (page - 1) * limit;
					if (scope.kind === "organization") {
						const result = await listOrganizationApiPrompts({
							organizationId: scope.organizationId,
							brandId: brandId ?? undefined,
							limit,
							offset,
						});
						return {
							prompts: result.items,
							pagination: {
								page,
								limit,
								total: result.total,
								totalPages: Math.ceil(result.total / limit),
							},
						};
					}

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
						.offset(offset);

					return {
						prompts: promptsList,
						pagination: { page, limit, total: totalCount, totalPages },
					};
				},
			}),

			POST: createApiHandler({
				cloudOrganizationScoped: true,
				body: createPromptBody,
				status: 201,
				mapError: mapOrganizationResourceError,
				handle: async ({ body, scope }) => {
					const { brandId, value, tags } = body;
					if (scope.kind === "organization") {
						return createOrganizationApiPrompt({
							organizationId: scope.organizationId,
							brandId,
							value,
							tags: sanitizeUserTags(tags ?? []),
						});
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
