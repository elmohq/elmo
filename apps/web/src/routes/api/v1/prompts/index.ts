/**
 * /api/v1/prompts - External API endpoint for prompt management
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { assertCanAddPrompts, withQuotaLock } from "@workspace/lib/entitlements";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { and, arrayOverlaps, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import { createPromptJobScheduler } from "@/lib/job-scheduler";

const createPromptBody = z.object({
	brandId: z.string().trim().min(1, "brandId is required"),
	value: z.string().trim().min(1, "value must be a non-empty string"),
	tags: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/v1/prompts/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["prompts:read"],
				handle: async ({ request, auth }) => {
					const { searchParams } = new URL(request.url);
					const brandId = searchParams.get("brandId");
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					// Clamped rather than rejected: the cap is here to bound a runaway
					// query, not to change what an existing caller gets back.
					const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get("limit") || "20")));
					const offset = (page - 1) * limit;

					const filters: (SQL | undefined)[] = [await brandScopeCondition(auth, prompts.brandId)];
					if (brandId) filters.push(eq(prompts.brandId, brandId));
					const enabled = searchParams.get("enabled");
					if (enabled === "true" || enabled === "false") {
						filters.push(eq(prompts.enabled, enabled === "true"));
					}
					const tags = (searchParams.get("tags") ?? "")
						.split(",")
						.map((tag) => tag.trim().toLowerCase())
						.filter(Boolean);
					if (tags.length > 0) filters.push(arrayOverlaps(prompts.tags, tags));
					const query = searchParams.get("q")?.trim();
					if (query) filters.push(ilike(prompts.value, `%${query}%`));

					const whereConditions = and(...filters.filter(Boolean));

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
							premiumModels: prompts.premiumModels,
							createdAt: prompts.createdAt,
							updatedAt: prompts.updatedAt,
						})
						.from(prompts)
						.where(whereConditions)
						.orderBy(desc(prompts.createdAt))
						.limit(limit)
						.offset(offset);

					// Both keys hold the same array while callers move to `data`, which
					// every other list in this API answers with.
					return {
						data: promptsList,
						prompts: promptsList,
						pagination: { page, limit, total: totalCount, totalPages },
					};
				},
			}),

			POST: createApiHandler({
				body: createPromptBody,
				status: 201,
				scopes: ["prompts:write"],
				handle: async ({ body, auth }) => {
					const { brandId, value, tags } = body;

					const brand = await requireBrandInScope(auth, brandId, "body");
					const userTags = tags ? sanitizeUserTags(tags) : [];
					const systemTags = computeSystemTags(value, brand.name, brand.website);

					const newPrompt = await withQuotaLock(brand.organizationId, async (tx, afterCommit) => {
						await assertCanAddPrompts(brand.organizationId, 1, tx);
						const [created] = await tx
							.insert(prompts)
							.values({ brandId, value, tags: userTags, systemTags, enabled: true })
							.returning();
						afterCommit(() => createPromptJobScheduler(created.id));
						return created;
					});

					return newPrompt;
				},
			}),
		}),
	},
});
