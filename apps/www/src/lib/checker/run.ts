import { analyzeAnswer, tallyCompetitors, tallySources } from "./mentions";
import { type Answer, answerPrompt, checkerModel, extractBrandNames, PROMPT_COUNT, profileBrand } from "./openai";
import { sampleAnswer, sampleBrandNames, sampleProfile } from "./sample-engine";
import { computeScore } from "./score";
import { checkSite } from "./site";
import type { CheckEvent, CheckResult, PromptResult } from "./types";

export interface CheckInput {
	domain: string;
	host: string;
	brandName?: string;
	category?: string;
}

/**
 * Sample mode is for local development only: without it, a missing key in
 * production would quietly serve fake answers as if they were real.
 */
export function usesSampleEngine(): boolean {
	if (process.env.AI_VISIBILITY_CHECKER_SAMPLE === "1") return true;
	return !process.env.OPENAI_API_KEY && process.env.NODE_ENV !== "production";
}

export function checkerConfigured(): boolean {
	return usesSampleEngine() || Boolean(process.env.OPENAI_API_KEY);
}

export async function runCheck(input: CheckInput, emit: (event: CheckEvent) => void): Promise<CheckResult> {
	const sample = usesSampleEngine();

	emit({ type: "stage", stage: "site" });
	const site = await checkSite(input.host);

	emit({ type: "stage", stage: "prompts" });
	const profileInput = {
		domain: input.domain,
		title: site.title,
		description: site.description,
		brandName: input.brandName,
		category: input.category,
	};
	const profile = await (sample ? sampleProfile(profileInput) : profileBrand(profileInput));
	const brandName = input.brandName || profile.brandName.trim() || input.domain;
	const category = input.category || profile.category.trim();
	const prompts = profile.prompts
		.map((prompt) => prompt.trim())
		.filter(Boolean)
		.slice(0, PROMPT_COUNT);
	if (prompts.length === 0) throw new Error("Could not generate prompts for this site");
	emit({ type: "prompts", brandName, category, prompts });

	emit({ type: "stage", stage: "answers" });
	const answers: (Answer | null)[] = await Promise.all(
		prompts.map(async (prompt, index) => {
			try {
				return await (sample
					? sampleAnswer(prompt, index, { name: brandName, domain: input.domain })
					: answerPrompt(prompt));
			} catch (error) {
				console.error("[ai-visibility-checker] answer failed", error);
				return null;
			} finally {
				emit({ type: "answer", index });
			}
		}),
	);
	if (answers.every((answer) => answer === null)) throw new Error("The AI engine didn't answer. Try again shortly.");

	emit({ type: "stage", stage: "analysis" });
	const texts = answers.map((answer) => answer?.text ?? "");
	let named: string[][];
	try {
		named = sample ? sampleBrandNames(texts) : await extractBrandNames(texts);
	} catch (error) {
		console.error("[ai-visibility-checker] brand extraction failed", error);
		named = texts.map(() => []);
	}

	const brand = { name: brandName, aliases: profile.aliases.filter(Boolean), domain: input.domain };
	const results: PromptResult[] = prompts.map((prompt, index) => {
		const answer = answers[index];
		if (!answer) {
			return { prompt, mentioned: false, position: null, competitors: [], cited: false, sources: [], failed: true };
		}
		return {
			prompt,
			...analyzeAnswer({ text: answer.text, sources: answer.sources, brand, namedBrands: named[index] }),
		};
	});

	return {
		domain: input.domain,
		brandName,
		category,
		engine: sample ? "Sample answers (local development)" : `ChatGPT with web search (${checkerModel()})`,
		checkedAt: new Date().toISOString(),
		prompts: results,
		recommendedInstead: tallyCompetitors(results),
		topSources: tallySources(results),
		site,
		score: computeScore(results, site),
		...(sample ? { sample: true } : {}),
	};
}
