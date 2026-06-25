/**
 * Server functions for the onboarding wizard + brand analysis.
 *
 * This file ONLY exports createServerFn server functions. No regular function
 * exports, no class exports, no db imports. TanStack Start replaces server
 * functions with lightweight RPC stubs on the client — but only if the module
 * doesn't drag in server-only dependencies (db, drizzle, pg) via other
 * exports. Keeping this file server-fn-only guarantees the client bundle
 * stays clean.
 *
 * Regular functions (createBrand, updateBrand, etc.) live in
 * ./onboarding-core.ts, imported only by API routes (server-only).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import { getBoss } from "@/lib/boss-client";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { saveWizardOnboarding, wizardOnboardingInputSchema } from "@/server/onboarding-core";

const ANALYZE_BRAND_QUEUE = "analyze-brand";

/** Discriminated status returned to the wizard while it polls. */
type AnalyzeBrandStatus =
	| { status: "pending" }
	| { status: "done"; suggestion: OnboardingSuggestion }
	| { status: "failed"; error: string };

/**
 * Kick off brand analysis as a background job and return its id immediately.
 *
 * Brand analysis is an LLM + web-search call that routinely runs ~1 minute,
 * which blows past reverse-proxy read timeouts when executed inline (the user
 * gets a 504 even though the work succeeds). The worker processes the job; the
 * client polls `getAnalyzeBrandStatusFn` for the result.
 */
export const startAnalyzeBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			website: z.string().min(1),
			brandName: z.string().optional(),
			maxCompetitors: z.number().int().min(0).optional(),
			maxPrompts: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireAuthSession();
		const boss = await getBoss();
		const jobId = await boss.send(ANALYZE_BRAND_QUEUE, data);
		if (!jobId) {
			throw new Error("Failed to enqueue brand analysis");
		}
		return { jobId };
	});

/** Poll the status/result of a brand-analysis job started by startAnalyzeBrandFn. */
export const getAnalyzeBrandStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ data }): Promise<AnalyzeBrandStatus> => {
		await requireAuthSession();
		const boss = await getBoss();
		const job = await boss.getJobById<OnboardingSuggestion>(ANALYZE_BRAND_QUEUE, data.jobId);

		// A just-enqueued job may not be visible yet — treat as pending.
		if (!job) {
			return { status: "pending" };
		}
		if (job.state === "completed") {
			return { status: "done", suggestion: job.output as OnboardingSuggestion };
		}
		if (job.state === "failed" || job.state === "cancelled") {
			const output = job.output as { message?: string } | null;
			return { status: "failed", error: output?.message || "Brand analysis failed" };
		}
		return { status: "pending" };
	});

/**
 * Persist the wizard's reviewed onboarding result for a brand the user
 * already has access to.
 */
export const updateOnboardedBrandFn = createServerFn({ method: "POST" })
	.validator(wizardOnboardingInputSchema)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);
		return saveWizardOnboarding(data);
	});
