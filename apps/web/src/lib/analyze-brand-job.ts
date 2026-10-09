/**
 * Server-only helpers for the async brand-analysis job. All pg-boss coupling
 * for the onboarding analysis lives here (on top of ./brand-jobs) so the
 * server functions in `@/server/onboarding` stay free of direct db imports.
 */

import { extractDomain } from "@workspace/lib/citations/domain-categories";
import { cleanOnboardingUrl, type OnboardingSuggestion } from "@workspace/lib/onboarding";
import { getBoss } from "@/lib/boss-client";
import { cancelLatestBrandJob, IN_FLIGHT_STATES, latestBrandJob, readBrandJob } from "@/lib/brand-jobs";

const ANALYZE_BRAND_QUEUE = "analyze-brand";

const GENERIC_FAILURE = "Brand analysis failed. Please try again.";

/** Discriminated status returned to the wizard while it polls. */
export type AnalyzeBrandStatus =
	| { status: "pending" }
	| { status: "done"; suggestion: OnboardingSuggestion }
	| { status: "failed"; error: string };

export interface AnalyzeBrandInput {
	/** Brand id (== org id) the analysis belongs to. Must be access-checked by the caller. */
	brandId: string;
	website: string;
	brandName?: string;
}

/**
 * The page an enqueued job will actually read. Two runs are "the same" only if
 * they research the same URL — `nike.com/golf` and `nike.com/running` share a
 * domain but produce completely different suggestions.
 */
function analysisKey(website: string): string {
	return cleanOnboardingUrl(website) || extractDomain(website);
}

/**
 * Enqueue a brand analysis, deduped by the brand + page it runs for.
 *
 * If an analysis for this page is already in flight we reuse it instead of
 * paying for a second run; once a job reaches a terminal state a fresh analysis
 * is allowed again (so "try again" works).
 *
 * We guard with an explicit in-flight check rather than pg-boss's `singletonKey`
 * because that would be a no-op here: `singleton_key` only enforces uniqueness
 * under a non-standard queue policy (short/singleton/stately) or with a
 * `singletonSeconds` window, and this queue uses the default `standard` policy
 * with no window. The check-then-send isn't atomic, but the analyze button is a
 * deliberate, low-frequency action (and disabled while running), so the worst
 * case — two near-simultaneous clicks racing past the check — is rare and
 * merely costs a duplicate run.
 */
export async function enqueueAnalyzeBrand(input: AnalyzeBrandInput): Promise<void> {
	const boss = await getBoss();
	const key = analysisKey(input.website);

	const latest = await latestBrandJob(ANALYZE_BRAND_QUEUE, input.brandId);
	const latestWebsite = typeof latest?.data?.website === "string" ? latest.data.website : "";
	if (latest && IN_FLIGHT_STATES.has(latest.state) && analysisKey(latestWebsite) === key) {
		return;
	}

	await boss.send(ANALYZE_BRAND_QUEUE, input);
}

export async function getAnalyzeBrandStatus(brandId: string): Promise<AnalyzeBrandStatus> {
	const job = await readBrandJob<OnboardingSuggestion>(ANALYZE_BRAND_QUEUE, brandId, GENERIC_FAILURE);
	return job.status === "done" ? { status: "done", suggestion: job.output } : job;
}

/** Used when the user backs out of the wizard. */
export async function cancelAnalyzeBrand(brandId: string): Promise<void> {
	await cancelLatestBrandJob(ANALYZE_BRAND_QUEUE, brandId);
}
