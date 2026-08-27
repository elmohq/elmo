/**
 * POST /api/v1/prompts/bulk — create up to 100 prompts for one brand.
 *
 * All-or-nothing. The batch is checked against the organization's prompt and
 * premium pools as a single delta and applied in one transaction, so a batch
 * that would overrun a limit creates nothing rather than part of itself and
 * leaves the caller guessing how far it got.
 */
import { createFileRoute } from "@tanstack/react-router";
import { selectPremiumModels } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { assertPromptSaveAllowed } from "@workspace/lib/entitlements";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { z } from "zod";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { createPromptJobScheduler } from "@/lib/job-scheduler";

const MAX_BATCH = 100;

const bulkBody = z.object({
	brandId: z.string().trim().min(1, "brandId is required"),
	prompts: z
		.array(
			z.object({
				value: z.string().trim().min(1, "value must be a non-empty string"),
				tags: z.array(z.string()).optional(),
				enabled: z.boolean().optional(),
				premiumModels: z.array(z.string()).optional(),
			}),
		)
		.min(1, "prompts must contain at least one entry")
		.max(MAX_BATCH, `prompts may contain at most ${MAX_BATCH} entries`),
});

export const Route = createFileRoute("/api/v1/prompts/bulk")({
	server: {
		handlers: withMethodGuard({
			POST: createApiHandler({
				body: bulkBody,
				status: 201,
				scopes: ["prompts:write"],
				handle: async ({ body, auth }) => {
					const brand = await requireBrandInScope(auth, body.brandId, "body");

					const rows = body.prompts.map((prompt) => ({
						brandId: brand.id,
						value: prompt.value,
						enabled: prompt.enabled ?? true,
						tags: sanitizeUserTags(prompt.tags ?? []),
						systemTags: computeSystemTags(prompt.value, brand.name, brand.website),
						premiumModels: selectPremiumModels(prompt.premiumModels),
					}));

					// One decision for the whole batch, against both pools it can spend.
					const enabled = rows.filter((row) => row.enabled);
					await assertPromptSaveAllowed(brand.organizationId, {
						prompts: enabled.length,
						premiumPairings: enabled.reduce((sum, row) => sum + row.premiumModels.length, 0),
					});

					const created = await db.transaction(async (tx) => tx.insert(prompts).values(rows).returning());

					// Scheduling is deliberately outside the transaction: a queue hiccup
					// must not roll back prompts the customer can see, and the worker's
					// self-healing scheduler picks up anything that failed to enqueue.
					for (const prompt of created) {
						if (prompt.enabled) await createPromptJobScheduler(prompt.id);
					}

					return { data: created };
				},
			}),
		}),
	},
});
