/**
 * Provider-agnostic onboarding research.
 *
 * Picks the first configured provider in the preference order below and
 * runs a structured research call against it:
 *
 *   1. Direct API providers (Anthropic / OpenAI / OpenRouter) get native
 *      structured outputs via the AI SDK's `generateObject`. The schema is
 *      passed straight through; there's no JSON regex on the response.
 *   2. Screen-scraper providers (Olostep / BrightData) don't have a native
 *      structured-output mode — we ask the chatbot for `<out>{...}</out>`
 *      JSON and parse it out of the reply text. This is the only path that
 *      keeps the (small, contained) text-extraction fallback.
 *
 * `ONBOARDING_LLM_TARGET` (parsed like a SCRAPE_TARGETS entry) overrides the
 * automatic preference if the deployment wants a specific provider.
 */
import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";
import { getProvider, parseScrapeTargets, type Provider } from "../providers";

/**
 * Direct-API providers first (cheaper + faster + native structured outputs),
 * then scraper providers as a fallback. Order is intentional and documented.
 */
const RESEARCH_PROVIDER_PREFERENCE = [
	"anthropic-api",
	"openai-api",
	"openrouter",
	"olostep",
	"brightdata",
] as const;

const ONBOARDING_LLM_TARGET_HELP =
	"Set ONBOARDING_LLM_TARGET (e.g. claude:anthropic-api:claude-sonnet-4-20250514) " +
	"or configure ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / OLOSTEP_API_KEY / BRIGHTDATA_API_TOKEN.";

export interface ResearchTarget {
	provider: Provider;
	model: string;
}

/**
 * Resolve which provider + model the onboarding flow should use.
 *
 * Resolution order:
 *   1. `ONBOARDING_LLM_TARGET` env override.
 *   2. First provider in `RESEARCH_PROVIDER_PREFERENCE` that's configured.
 */
export function resolveResearchTarget(env: Record<string, string | undefined> = process.env): ResearchTarget {
	const explicit = env.ONBOARDING_LLM_TARGET?.trim();
	if (explicit) {
		const [parsed] = parseScrapeTargets(explicit);
		if (!parsed) throw new Error(`Invalid ONBOARDING_LLM_TARGET: "${explicit}"`);
		const provider = getProvider(parsed.provider);
		if (!provider.isConfigured()) {
			throw new Error(
				`ONBOARDING_LLM_TARGET points at "${parsed.provider}" but it isn't configured. ${ONBOARDING_LLM_TARGET_HELP}`,
			);
		}
		const model = parsed.version ?? provider.defaultResearchModel ?? parsed.model;
		return { provider, model };
	}

	for (const id of RESEARCH_PROVIDER_PREFERENCE) {
		const provider = getProvider(id);
		if (!provider.isConfigured()) continue;
		const model = provider.defaultResearchModel;
		if (!model) continue;
		return { provider, model };
	}

	throw new Error(`Onboarding requires at least one LLM provider. ${ONBOARDING_LLM_TARGET_HELP}`);
}

export interface RunStructuredOptions<T> {
	schema: z.ZodType<T>;
	target?: ResearchTarget;
	/** Forwarded to AI SDK; useful for nudging models that occasionally truncate. */
	maxRetries?: number;
}

/**
 * Run a research prompt and return a Zod-validated structured response.
 * Direct-API providers use AI SDK's `generateObject`; scrapers fall back to
 * text + JSON extraction.
 */
export async function runStructuredResearchPrompt<T>(
	prompt: string,
	options: RunStructuredOptions<T>,
): Promise<T> {
	const target = options.target ?? resolveResearchTarget();
	const { provider, model } = target;

	if (provider.languageModel) {
		try {
			const { object } = await generateObject({
				model: provider.languageModel(model),
				schema: options.schema,
				prompt,
				maxRetries: options.maxRetries ?? 1,
			});
			return object;
		} catch (err) {
			if (err instanceof NoObjectGeneratedError) {
				throw new Error(
					`[${provider.id}:${model}] LLM did not return a parseable object: ${err.message}`,
				);
			}
			throw err;
		}
	}

	// Scraper fallback — wrap the prompt so the chatbot reliably emits JSON.
	const wrapped = wrapPromptForJsonExtraction(prompt);
	const result = await provider.run(model, wrapped, { webSearch: true });
	const json = extractJsonFromText(result.textContent);
	return options.schema.parse(json);
}

/**
 * Plain-text research call. Used for the few legacy callers (keyword
 * filtering, persona grouping) that still expect free-form text. New code
 * should prefer `runStructuredResearchPrompt`.
 */
export async function runResearchPrompt(prompt: string, target?: ResearchTarget): Promise<string> {
	const resolved = target ?? resolveResearchTarget();
	const result = await resolved.provider.run(resolved.model, prompt, { webSearch: true });
	return result.textContent;
}

// ---------------------------------------------------------------------------
// Scraper fallback: text → JSON
// ---------------------------------------------------------------------------

function wrapPromptForJsonExtraction(prompt: string): string {
	return `${prompt}\n\nIMPORTANT: Reply with ONLY a single JSON value wrapped in <out>...</out> tags. No prose outside the tags.`;
}

/**
 * Pull a JSON value out of an LLM response. Used only for scraper providers
 * that can't do native structured outputs.
 */
export function extractJsonFromText(text: string): unknown {
	if (!text || !text.trim()) throw new Error("Empty LLM response");

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

// Re-export for callers that want to grab a language model directly without
// going through the structured-prompt wrapper (e.g. ad-hoc generateText calls).
export type { LanguageModel };
