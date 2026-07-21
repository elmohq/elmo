/**
 * Org-level prompt entitlement guards (§7), shared by `updatePromptsFn` and the
 * /api/v1/prompts routes. Both are write-time "configurable limit" checks (A5):
 * they keep config honest; the worker's schedule-time re-clamp remains the
 * spend authority. Non-cloud entitlements are unlimited, so every guard here is
 * inert outside cloud — existing local/whitelabel/demo behavior is unchanged.
 */
import { ASSIGNABLE_MODELS, UNLIMITED_COUNT } from "@workspace/config/plans";
import { getEntitlements } from "@workspace/lib/config/entitlements";
import { countAssignableModelUsage } from "@workspace/lib/config/resolve";
import { db } from "@workspace/lib/db/db";
import { brands, configs, prompts } from "@workspace/lib/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { assertClaudePoolHeadroom, assertOrgPromptLimit } from "@/server/config-enforcement";

/** Total prompts across every brand the org owns. */
async function countOrgPrompts(organizationId: string): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(prompts)
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(eq(brands.organizationId, organizationId));
	return Number(row?.count ?? 0);
}

/**
 * Throw when adding `adding` prompts would exceed the org's `maxPromptsPerOrg`
 * (the server-side gap behind the UI-only MAX_PROMPTS cap). No-op when the
 * entitlement is unlimited or nothing is being added.
 */
export async function assertCanAddPromptsToOrg(organizationId: string, adding: number): Promise<void> {
	if (adding <= 0) return;
	const entitlements = await getEntitlements(organizationId);
	if (entitlements.maxPromptsPerOrg === null) return;
	const current = await countOrgPrompts(organizationId);
	assertOrgPromptLimit(entitlements, current, adding);
}

/**
 * A5 enable-transition re-check: enabling prompts brings their assignable-model
 * (Claude) `run.model_mode` assignments back into the pool count. Given the
 * prompt ids flipping enabled false→true, throw when the pool would overflow.
 * The current pool count only covers enabled prompts, so the flipped ones are
 * exactly the increment.
 */
export async function assertEnableTransitionWithinPool(organizationId: string, promptIds: string[]): Promise<void> {
	if (promptIds.length === 0) return;
	const entitlements = await getEntitlements(organizationId);
	if (entitlements.claudePromptPool >= UNLIMITED_COUNT) return;

	for (const model of ASSIGNABLE_MODELS) {
		const assignedRows = await db
			.select({ promptId: configs.promptId })
			.from(configs)
			.where(
				and(
					eq(configs.scope, "prompt"),
					eq(configs.key, "run.model_mode"),
					eq(configs.model, model),
					inArray(configs.promptId, promptIds),
				),
			);
		const assignedFlipping = new Set(assignedRows.map((r) => r.promptId)).size;
		if (assignedFlipping === 0) continue;

		const currentUsage = await countAssignableModelUsage(organizationId, model);
		assertClaudePoolHeadroom(entitlements, currentUsage + assignedFlipping);
	}
}
