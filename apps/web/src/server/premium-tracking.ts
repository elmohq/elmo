/**
 * The organization's premium allowance (cloud plans).
 *
 * A premium model called without web search is an ordinary platform pick that
 * every standard plan may choose. Grounded, it is metered per prompt because the
 * call costs roughly ten times an ungrounded one: the plan includes a pool of
 * prompt/model slots and Pro/Business can buy more.
 *
 * Which prompts spend the pool is chosen in the prompts editor and saved with
 * the rest of a prompt's fields, so this module only reports the totals the
 * LLM settings page shows.
 */
import { createServerFn } from "@tanstack/react-start";
import { countOrgAssignedPremiumSlots, getOrgEntitlements } from "@workspace/lib/entitlements";
import { z } from "zod";
import { requireAuthSession, requireBrandOrganization } from "@/lib/auth/helpers";

export type PremiumPool = {
	/** Whether the plan grants any premium slots at all. */
	available: boolean;
	assigned: number;
	/** Plan included (or custom override) plus any purchased add-on. */
	total: number;
};

export const getPremiumPoolFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<PremiumPool> => {
		const session = await requireAuthSession();
		const { id: organizationId } = await requireBrandOrganization(session.user.id, data.brandId);

		const entitlements = await getOrgEntitlements(organizationId);
		if (entitlements.unlimited || entitlements.premiumPool <= 0) {
			return { available: false, assigned: 0, total: 0 };
		}

		return {
			available: true,
			assigned: await countOrgAssignedPremiumSlots(organizationId),
			total: entitlements.premiumPool,
		};
	});
