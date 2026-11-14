import type { Entitlements } from "@workspace/config/entitlements";
import { getDeploymentModeFromEnv } from "@workspace/config/env";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { type Brand, type Prompt, promptRuns } from "@workspace/lib/db/schema";
import {
	isPromptOverdueForAlert,
	type LastRunRow,
	lastRunQueryWindowMs,
	lastRunsByTargetKey,
	resolveBrandPromptRunPlans,
	slowestIntervalHours,
} from "@workspace/lib/run-policy";
import { and, eq, gt, sql } from "drizzle-orm";

/**
 * Self-hosters have no Sentry, so a crash-looping worker or a missing provider key
 * would otherwise go unnoticed while the dashboard keeps showing old data.
 */
export async function countOverduePrompts(
	brand: Brand,
	brandPrompts: Prompt[],
	entitlements: Entitlements,
): Promise<number> {
	if (getDeploymentModeFromEnv() !== "local" || !brand.enabled) return 0;
	const enabled = brandPrompts.filter((prompt) => prompt.enabled);
	if (enabled.length === 0) return 0;

	try {
		const plans = resolveBrandPromptRunPlans({
			scrapeTargets: parseScrapeTargets(process.env.SCRAPE_TARGETS),
			defaultDelayHours: getDefaultDelayHours(),
			entitlements,
			orgPrompts: [],
			brand: { enabledModels: brand.enabledModels, delayOverrideHours: brand.delayOverrideHours },
			prompts: enabled,
		});

		const maxIntervalHours = Math.max(1, ...[...plans.values()].map((plan) => slowestIntervalHours(plan.targets)));
		const rows = await db
			.select({
				promptId: promptRuns.promptId,
				model: promptRuns.model,
				provider: promptRuns.provider,
				webSearchEnabled: promptRuns.webSearchEnabled,
				lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
			})
			.from(promptRuns)
			.where(
				and(
					eq(promptRuns.brandId, brand.id),
					gt(promptRuns.createdAt, new Date(Date.now() - lastRunQueryWindowMs(maxIntervalHours))),
				),
			)
			.groupBy(promptRuns.promptId, promptRuns.model, promptRuns.provider, promptRuns.webSearchEnabled);

		const rowsByPrompt = new Map<string, LastRunRow[]>();
		for (const row of rows) rowsByPrompt.set(row.promptId, [...(rowsByPrompt.get(row.promptId) ?? []), row]);

		const now = new Date();
		return enabled.filter((prompt) => {
			const plan = plans.get(prompt.id);
			return (
				plan !== undefined &&
				isPromptOverdueForAlert(
					{
						promptCreatedAt: prompt.createdAt,
						plan,
						lastRunAtByKey: lastRunsByTargetKey(rowsByPrompt.get(prompt.id) ?? []),
					},
					now,
				)
			);
		}).length;
	} catch (error) {
		console.error(`[run-delays] Could not check brand ${brand.id} for delayed runs:`, error);
		return 0;
	}
}
