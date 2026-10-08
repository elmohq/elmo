/**
 * Server-only helpers for "Suggest prompts" on the prompts page. Same shape as
 * the onboarding analysis in ./analyze-brand-job: the worker runs the LLM call
 * and the client polls the latest job by brand.
 *
 * The daily allowance is counted straight from pg-boss's job rows, which keep
 * the brand id in `data` and outlive the 24-hour window, so it needs no table
 * of its own.
 */

import { dedupeKey } from "@workspace/lib/bulk-prompts";
import { PROMPT_SUGGESTION_RUNS_PER_DAY } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import type { OnboardingPrompt } from "@workspace/lib/onboarding";
import { eq, sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";

const SUGGEST_PROMPTS_QUEUE = "suggest-prompts";
const SUGGESTIONS_PER_RUN = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const IN_FLIGHT_STATES = new Set(["created", "active", "retry"]);

/** The worker's real error is already in Sentry; the browser gets this. */
const GENERIC_FAILURE = "Couldn't suggest prompts. Please try again.";

export type PromptSuggestionsStatus =
	| { status: "pending" }
	| { status: "done"; prompts: OnboardingPrompt[] }
	| { status: "failed"; error: string };

export interface PromptSuggestionsInput {
	brandId: string;
	/** Prompts on screen that aren't saved yet, or that an earlier run suggested
	 *  and the user passed on — the model is told to steer clear of them too. */
	exclude: string[];
}

interface JobRow {
	id: string;
	state: string;
	output: unknown;
}

async function latestJobForBrand(brandId: string): Promise<JobRow | undefined> {
	const result = await db.execute(sql`
		SELECT id, state, output
		FROM pgboss.job
		WHERE name = ${SUGGEST_PROMPTS_QUEUE} AND data->>'brandId' = ${brandId}
		ORDER BY created_on DESC
		LIMIT 1
	`);
	return result.rows[0] as unknown as JobRow | undefined;
}

/**
 * Runs that count toward today's allowance. A failed run isn't the user's
 * doing, so it doesn't use one up; a cancelled one may already have spent the
 * tokens, so it does.
 */
async function runsInWindow(brandId: string): Promise<{ used: number; oldest: Date | null }> {
	const since = new Date(Date.now() - WINDOW_MS);
	const result = await db.execute(sql`
		SELECT count(*)::int AS used, min(created_on) AS oldest
		FROM pgboss.job
		WHERE name = ${SUGGEST_PROMPTS_QUEUE}
		  AND data->>'brandId' = ${brandId}
		  AND state <> 'failed'
		  AND created_on > ${since.toISOString()}
	`);
	const row = result.rows[0] as { used: number; oldest: string | null } | undefined;
	return { used: row?.used ?? 0, oldest: row?.oldest ? new Date(row.oldest) : null };
}

function describeWait(until: Date): string {
	const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
	const hours = Math.ceil(minutes / 60);
	return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Start a run unless one is already going, in which case the caller just
 * polls that one. The count-then-send isn't atomic, so two clicks racing past
 * the check could both start; the button is disabled while a run is going, so
 * that costs at most one extra run.
 */
export async function enqueuePromptSuggestions(input: PromptSuggestionsInput): Promise<{ remaining: number }> {
	const { used, oldest } = await runsInWindow(input.brandId);

	const latest = await latestJobForBrand(input.brandId);
	if (latest && IN_FLIGHT_STATES.has(latest.state)) {
		return { remaining: Math.max(0, PROMPT_SUGGESTION_RUNS_PER_DAY - used) };
	}

	if (used >= PROMPT_SUGGESTION_RUNS_PER_DAY) {
		const resetsAt = new Date((oldest?.getTime() ?? Date.now()) + WINDOW_MS);
		throw new Error(
			`You've used all ${PROMPT_SUGGESTION_RUNS_PER_DAY} prompt suggestion runs for today. Try again in ${describeWait(resetsAt)}.`,
		);
	}

	const [brand, brandPrompts, brandCompetitors] = await Promise.all([
		db.query.brands.findFirst({ where: eq(brands.id, input.brandId) }),
		db.select({ value: prompts.value, tags: prompts.tags }).from(prompts).where(eq(prompts.brandId, input.brandId)),
		db.select({ name: competitors.name }).from(competitors).where(eq(competitors.brandId, input.brandId)),
	]);
	if (!brand) throw new Error("Brand not found");

	// Disabled prompts are in here too: removing a prompt on the prompts page
	// disables it, and suggesting it straight back would be unwelcome.
	const existing = new Map<string, string>();
	for (const value of [...brandPrompts.map((p) => p.value), ...input.exclude]) {
		const key = dedupeKey(value);
		if (key && !existing.has(key)) existing.set(key, value.trim());
	}

	const boss = await getBoss();
	await boss.send(SUGGEST_PROMPTS_QUEUE, {
		brandId: input.brandId,
		website: brand.website,
		brandName: brand.name,
		existingPrompts: [...existing.values()],
		existingTags: [...new Set(brandPrompts.flatMap((p) => p.tags ?? []))].sort(),
		competitors: brandCompetitors.map((c) => c.name),
		count: SUGGESTIONS_PER_RUN,
	});

	return { remaining: PROMPT_SUGGESTION_RUNS_PER_DAY - used - 1 };
}

export async function getPromptSuggestionsStatus(brandId: string): Promise<PromptSuggestionsStatus> {
	const job = await latestJobForBrand(brandId);
	if (!job) return { status: "pending" };
	if (job.state === "completed") {
		return { status: "done", prompts: (job.output as { prompts: OnboardingPrompt[] }).prompts };
	}
	if (job.state === "failed" || job.state === "cancelled") {
		console.error("[suggest-prompts] job ended without a result", { brandId, jobId: job.id, state: job.state });
		return { status: "failed", error: GENERIC_FAILURE };
	}
	return { status: "pending" };
}

export async function cancelPromptSuggestions(brandId: string): Promise<void> {
	const job = await latestJobForBrand(brandId);
	if (!job || !IN_FLIGHT_STATES.has(job.state)) return;
	const boss = await getBoss();
	try {
		await boss.cancel(SUGGEST_PROMPTS_QUEUE, job.id);
	} catch {
		// It may have finished between the read and the cancel.
	}
}
