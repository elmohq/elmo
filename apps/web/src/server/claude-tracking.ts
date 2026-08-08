/**
 * Per-prompt Claude tracking assignment against the organization's Claude
 * pool (cloud plans). Kept out of prompts.ts for the same reason
 * platform-picks.ts is kept out of brands.ts: prompt CRUD and plan-scoped
 * assignment are separate concerns with separate limits.
 *
 * Claude is never a platform pick — it is an allowance a prompt is assigned,
 * so the pool is org-wide while the list below is scoped to one brand.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { type ClaudeMode, prompts } from "@workspace/lib/db/schema";
import { assertCanAssignClaude, countOrgAssignedClaudePrompts, getOrgEntitlements } from "@workspace/lib/entitlements";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandOrganization } from "@/lib/auth/helpers";

export type ClaudeAssignmentsState = {
	/** Whether this org's plan has any Claude pool at all. */
	enabled: boolean;
	pool: { assigned: number; total: number };
	/** This brand's enabled prompts with their current assignment. */
	prompts: { id: string; value: string; claudeMode: ClaudeMode | null }[];
};

export const getClaudeAssignmentsFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<ClaudeAssignmentsState> => {
		const session = await requireAuthSession();
		const { id: organizationId } = await requireBrandOrganization(session.user.id, data.brandId);

		const entitlements = await getOrgEntitlements(organizationId);
		if (entitlements.unlimited || entitlements.claudePool <= 0) {
			return { enabled: false, pool: { assigned: 0, total: 0 }, prompts: [] };
		}

		const [assigned, brandPrompts] = await Promise.all([
			countOrgAssignedClaudePrompts(organizationId),
			db
				.select({ id: prompts.id, value: prompts.value, claudeMode: prompts.claudeMode })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)))
				.orderBy(prompts.createdAt),
		]);

		return {
			enabled: true,
			pool: { assigned, total: entitlements.claudePool },
			prompts: brandPrompts,
		};
	});

export const setPromptClaudeModeFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			promptId: z.string(),
			mode: z.enum(["base", "web"]).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();

		const prompt = await db.query.prompts.findFirst({ where: eq(prompts.id, data.promptId) });
		if (!prompt) throw new Error("Prompt not found");
		const organization = await requireBrandOrganization(session.user.id, prompt.brandId);

		// Only the off→on transition consumes the pool; switching base↔web or
		// unassigning is always allowed.
		if (prompt.claudeMode === null && data.mode !== null) {
			await assertCanAssignClaude(organization.id, 1);
		}

		const [updated] = await db
			.update(prompts)
			.set({ claudeMode: data.mode })
			.where(eq(prompts.id, data.promptId))
			.returning({ id: prompts.id, claudeMode: prompts.claudeMode });
		return updated;
	});
