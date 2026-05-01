/**
 * Provider-agnostic onboarding research.
 *
 * Onboarding always runs against a direct API provider (Anthropic / OpenAI /
 * OpenRouter / Mistral) — the deployment guarantees one is configured, and
 * the CLI's setup wizard enforces it. Each provider implements
 * `runStructuredResearch<T>(prompt, schema)` itself, picking the most
 * idiomatic combo for its API:
 *   • Anthropic / OpenAI — `generateText` + native web-search tool +
 *     `experimental_output: Output.object(schema)`.
 *   • OpenRouter — `generateObject` against a `:online`-suffixed slug
 *     (web search baked into the route).
 *   • Mistral — OpenAI-compat `generateObject` (no web search; users who
 *     want it should target a different provider via ONBOARDING_LLM_TARGET).
 *
 * This module's job is just to pick the right provider and forward the call.
 * No prompt wrappers, no JSON parsing, no two-pass anything.
 *
 * `ONBOARDING_LLM_TARGET` (parsed like a SCRAPE_TARGETS entry) overrides the
 * preference order if a deployment wants a specific provider/model.
 */
import type { z } from "zod";
import {
	getProvider,
	parseScrapeTargets,
	type Provider,
	type StructuredResearchResult,
} from "../providers";

/**
 * Direct-API providers in the order onboarding prefers them. OpenRouter is
 * highest because a single key opens up multiple models (Anthropic, OpenAI,
 * Gemini, Mistral) and gets web search for free via `:online`. Anthropic and
 * OpenAI come next; Mistral last because it has no AI-SDK web-search path.
 */
const RESEARCH_PROVIDER_PREFERENCE = [
	"openrouter",
	"anthropic-api",
	"openai-api",
	"mistral-api",
] as const;

const ONBOARDING_LLM_TARGET_HELP =
	"Set ONBOARDING_LLM_TARGET (e.g. claude:anthropic-api:claude-sonnet-4-20250514) " +
	"or configure ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / MISTRAL_API_KEY.";

export interface ResearchTarget {
	provider: Provider;
	model: string;
}

/**
 * Resolve which provider + model the onboarding flow should use.
 *
 * Resolution order:
 *   1. `ONBOARDING_LLM_TARGET` env override.
 *   2. First provider in `RESEARCH_PROVIDER_PREFERENCE` that's configured AND
 *      implements `runStructuredResearch`.
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
		if (!provider.runStructuredResearch) {
			throw new Error(
				`ONBOARDING_LLM_TARGET points at "${parsed.provider}", which does not support structured research. ${ONBOARDING_LLM_TARGET_HELP}`,
			);
		}
		const model = parsed.version ?? provider.defaultResearchModel ?? parsed.model;
		return { provider, model };
	}

	for (const id of RESEARCH_PROVIDER_PREFERENCE) {
		const provider = getProvider(id);
		if (!provider.isConfigured()) continue;
		if (!provider.runStructuredResearch) continue;
		const model = provider.defaultResearchModel;
		if (!model) continue;
		return { provider, model };
	}

	throw new Error(`Onboarding requires at least one direct LLM API provider. ${ONBOARDING_LLM_TARGET_HELP}`);
}

export interface RunStructuredOptions<T> {
	schema: z.ZodType<T>;
	target?: ResearchTarget;
}

/**
 * Run a research prompt and return a Zod-validated structured response. The
 * heavy lifting (web search, structured outputs, retry) lives inside each
 * provider's `runStructuredResearch` impl — we just pick the target.
 */
export async function runStructuredResearchPrompt<T>(
	prompt: string,
	options: RunStructuredOptions<T>,
): Promise<T> {
	const result = await runStructuredResearchPromptWithMetrics(prompt, options);
	return result.object;
}

/**
 * Same as `runStructuredResearchPrompt` but also returns token usage and the
 * resolved model version. Used by tooling that needs to report cost (the
 * compare-onboarding script, future telemetry).
 */
export async function runStructuredResearchPromptWithMetrics<T>(
	prompt: string,
	options: RunStructuredOptions<T>,
): Promise<StructuredResearchResult<T>> {
	const target = options.target ?? resolveResearchTarget();
	if (!target.provider.runStructuredResearch) {
		throw new Error(`Provider "${target.provider.id}" does not implement structured research`);
	}
	return target.provider.runStructuredResearch({
		prompt,
		schema: options.schema,
		model: target.model,
	});
}
