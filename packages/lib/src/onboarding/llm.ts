/**
 * Provider-agnostic LLM glue for the onboarding pipeline.
 *
 * The day-to-day `SCRAPE_TARGETS` config picks which models we evaluate user
 * prompts against. Onboarding is different — we want a single research call
 * (with web search, ideally) that can run against whatever provider stack the
 * deployment happens to have keys for. This module handles that selection
 * plus structured-JSON parsing with retries.
 */
import { z } from "zod";
import { getProvider, parseScrapeTargets, type ModelConfig } from "../providers";

const ONBOARDING_LLM_TARGET_HELP =
	"Set ONBOARDING_LLM_TARGET (e.g. claude:anthropic-api:claude-sonnet-4-20250514:online) " +
	"or configure ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / OLOSTEP_API_KEY / BRIGHTDATA_API_TOKEN.";

/**
 * Resolve the LLM the onboarding flow will use to research a brand.
 *
 * Resolution order:
 *   1. `ONBOARDING_LLM_TARGET` env var (parsed like a SCRAPE_TARGETS entry).
 *   2. Direct API providers in cost/latency order: Anthropic → OpenAI →
 *      OpenRouter (Gemini default).
 *   3. Scraper-only providers (Olostep / BrightData) as a last resort,
 *      driving Gemini through their existing parser/dataset.
 */
export function resolveOnboardingTarget(
	env: Record<string, string | undefined> = process.env,
): ModelConfig {
	const explicit = env.ONBOARDING_LLM_TARGET?.trim();
	if (explicit) {
		const [parsed] = parseScrapeTargets(explicit);
		if (!parsed) {
			throw new Error(`Invalid ONBOARDING_LLM_TARGET: "${explicit}"`);
		}
		return parsed;
	}

	if (env.ANTHROPIC_API_KEY) {
		return {
			model: "claude",
			provider: "anthropic-api",
			version: env.ONBOARDING_ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
			webSearch: true,
		};
	}
	if (env.OPENAI_API_KEY) {
		return {
			model: "chatgpt",
			provider: "openai-api",
			version: env.ONBOARDING_OPENAI_MODEL || "gpt-5-mini",
			webSearch: true,
		};
	}
	if (env.OPENROUTER_API_KEY) {
		return {
			model: "gemini",
			provider: "openrouter",
			version: env.ONBOARDING_OPENROUTER_MODEL || "google/gemini-2.5-flash",
			webSearch: true,
		};
	}
	if (env.OLOSTEP_API_KEY) {
		return { model: "gemini", provider: "olostep", webSearch: true };
	}
	if (env.BRIGHTDATA_API_TOKEN) {
		return { model: "gemini", provider: "brightdata", webSearch: true };
	}

	throw new Error(`Onboarding requires at least one LLM provider. ${ONBOARDING_LLM_TARGET_HELP}`);
}

export interface RunResearchPromptOptions {
	target?: ModelConfig;
}

export async function runResearchPrompt(
	prompt: string,
	options: RunResearchPromptOptions = {},
): Promise<string> {
	const target = options.target ?? resolveOnboardingTarget();
	const provider = getProvider(target.provider);
	const result = await provider.run(target.model, prompt, {
		webSearch: target.webSearch,
		version: target.version,
	});
	return result.textContent;
}

/**
 * Pull a JSON value out of an LLM response. We try the formats models
 * actually use, in roughly decreasing order of how strongly we asked for them
 * in the prompt:
 *   1. Inside `<out>...</out>` (the prompt explicitly tells the model to do this).
 *   2. Inside a fenced code block (some models always wrap JSON in ```).
 *   3. The first standalone {...} or [...] in the text.
 *   4. The whole response as JSON, if it happens to be pure JSON.
 */
export function extractJsonFromText(text: string): unknown {
	if (!text || !text.trim()) {
		throw new Error("Empty LLM response");
	}

	const xmlMatch = text.match(/<out>\s*([\s\S]*?)\s*<\/out>/i);
	if (xmlMatch) return JSON.parse(stripCodeFence(xmlMatch[1]));

	const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	if (codeBlock) return JSON.parse(codeBlock[1].trim());

	const objMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
	if (objMatch) return JSON.parse(objMatch[0]);

	return JSON.parse(text.trim());
}

function stripCodeFence(s: string): string {
	const trimmed = s.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
	return fenced ? fenced[1].trim() : trimmed;
}

export interface RunStructuredPromptOptions<T> extends RunResearchPromptOptions {
	schema: z.ZodType<T>;
	maxAttempts?: number;
}

/**
 * Run a research prompt and parse the response as JSON validated by `schema`.
 * Retries on parse/validation failure — LLMs occasionally emit truncated or
 * lightly-malformed JSON, so a single retry covers most flaky cases without
 * making the path expensive in the happy case.
 */
export async function runStructuredResearchPrompt<T>(
	prompt: string,
	options: RunStructuredPromptOptions<T>,
): Promise<T> {
	const { schema, maxAttempts = 2, target } = options;
	const errors: string[] = [];

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		let text = "";
		try {
			text = await runResearchPrompt(prompt, { target });
			const json = extractJsonFromText(text);
			return schema.parse(json);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			errors.push(`attempt ${attempt}: ${message}`);
			if (attempt === maxAttempts) {
				throw new Error(
					`Failed to parse structured LLM response after ${maxAttempts} attempts. ${errors.join(" | ")}`,
				);
			}
		}
	}

	throw new Error(`Failed to parse structured LLM response: ${errors.join(" | ")}`);
}
