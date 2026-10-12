import { type OnboardingPrompt, type SuggestPromptsOptions, suggestPrompts } from "@workspace/lib/onboarding";
import type { Job } from "pg-boss";

export interface SuggestPromptsData extends SuggestPromptsOptions {
	brandId: string;
}

export interface SuggestPromptsResult {
	prompts: OnboardingPrompt[];
}

export async function suggestPromptsJob(jobs: Job<SuggestPromptsData>[]): Promise<SuggestPromptsResult> {
	const [job] = jobs;
	if (!job) {
		throw new Error("suggest-prompts handler received an empty batch");
	}

	return { prompts: await suggestPrompts(job.data) };
}
