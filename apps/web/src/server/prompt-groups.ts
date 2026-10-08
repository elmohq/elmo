/** Server functions for a prompt's group: its variants and how each model runs them. */
import { createServerFn } from "@tanstack/react-start";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { getOrgEntitlements } from "@workspace/lib/entitlements";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { describeGroupRuns } from "@/server/prompt-group-core";

export const getPromptGroupFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), promptId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		const prompt = await db.query.prompts.findFirst({
			where: and(eq(prompts.id, data.promptId), eq(prompts.brandId, data.brandId)),
		});
		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!prompt || !brand) return null;

		const members = await db
			.select({
				id: prompts.id,
				value: prompts.value,
				enabled: prompts.enabled,
				country: prompts.country,
				language: prompts.language,
				premiumModels: prompts.premiumModels,
			})
			.from(prompts)
			.where(and(eq(prompts.brandId, data.brandId), eq(prompts.groupId, prompt.groupId)))
			.orderBy(prompts.country, prompts.language, prompts.createdAt);
		// Removed prompts are disabled rows; the group shows what's live, plus the
		// page's own prompt so a disabled one still explains itself.
		const shown = members.filter((member) => member.enabled || member.id === prompt.id);

		let targets: ReturnType<typeof describeGroupRuns> = [];
		try {
			targets = describeGroupRuns({
				members: shown,
				scrapeTargets: parseScrapeTargets(process.env.SCRAPE_TARGETS),
				brand: { enabledModels: brand.enabledModels, delayOverrideHours: brand.delayOverrideHours },
				entitlements: await getOrgEntitlements(brand.organizationId),
				defaultDelayHours: getDefaultDelayHours(),
			});
		} catch (error) {
			// A misconfigured SCRAPE_TARGETS already fails boot validation; the page
			// still shows the group without the per-model breakdown.
			console.error("Failed to describe prompt group runs:", error);
		}

		return {
			groupId: prompt.groupId,
			members: shown.map(({ premiumModels: _, ...member }) => member),
			targets,
		};
	});
