import { dedupeKey } from "@workspace/lib/bulk-prompts";
import { PROMPT_SUGGESTION_RUNS_PER_DAY } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import type { OnboardingPrompt } from "@workspace/lib/onboarding";
import { eq } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";
import { type BrandJob, brandJobs, cancelLatestBrandJob, IN_FLIGHT_STATES, readBrandJob } from "@/lib/brand-jobs";

const SUGGEST_PROMPTS_QUEUE = "suggest-prompts";
const SUGGESTIONS_PER_RUN = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const GENERIC_FAILURE = "Couldn't suggest prompts. Please try again.";

export type PromptSuggestionsStatus =
	| { status: "pending" }
	| { status: "done"; prompts: OnboardingPrompt[] }
	| { status: "failed"; error: string };

export interface PromptSuggestionsInput {
	brandId: string;
	exclude: string[];
}

function runsInWindow(jobs: BrandJob[]): { used: number; oldest: Date | null } {
	const since = Date.now() - WINDOW_MS;
	const counted = jobs.filter((job) => job.state !== "failed" && job.createdOn.getTime() > since);
	return { used: counted.length, oldest: counted.at(-1)?.createdOn ?? null };
}

function describeWait(until: Date): string {
	const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
	const hours = Math.ceil(minutes / 60);
	return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export async function enqueuePromptSuggestions(input: PromptSuggestionsInput): Promise<{ remaining: number }> {
	const jobs = await brandJobs(SUGGEST_PROMPTS_QUEUE, input.brandId);
	const { used, oldest } = runsInWindow(jobs);

	const latest = jobs[0];
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
	const job = await readBrandJob<{ prompts: OnboardingPrompt[] }>(SUGGEST_PROMPTS_QUEUE, brandId, GENERIC_FAILURE);
	return job.status === "done" ? { status: "done", prompts: job.output.prompts } : job;
}

export async function cancelPromptSuggestions(brandId: string): Promise<void> {
	await cancelLatestBrandJob(SUGGEST_PROMPTS_QUEUE, brandId);
}
