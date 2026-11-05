/**
 * Onboarding always runs on a direct API provider, which startup validation
 * guarantees. Each provider implements web search and structured output itself;
 * this only picks one. Mistral has no web search.
 */
import { RESEARCH_PROVIDER_PREFERENCE } from "@workspace/config/env-registry";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import type { z } from "zod";
import { getProvider, type Provider, type StructuredResearchResult } from "../providers";

export { RESEARCH_PROVIDER_PREFERENCE };

export type ResearchProviderId = (typeof RESEARCH_PROVIDER_PREFERENCE)[number];

const ONBOARDING_LLM_TARGET_HELP =
	"Set ONBOARDING_LLM_TARGET (e.g. claude:anthropic-api) " +
	"or configure ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / MISTRAL_API_KEY.";

/**
 * Only the provider segment of `ONBOARDING_LLM_TARGET` is honored: each provider
 * picks its own research model (`DEFAULT_RESEARCH_MODEL`).
 */
export function resolveResearchProvider(env: Record<string, string | undefined> = process.env): Provider {
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
		return provider;
	}

	for (const id of RESEARCH_PROVIDER_PREFERENCE) {
		const provider = getProvider(id);
		if (!provider.isConfigured()) continue;
		if (!provider.runStructuredResearch) continue;
		return provider;
	}

	throw new Error(`Onboarding requires at least one direct LLM API provider. ${ONBOARDING_LLM_TARGET_HELP}`);
}

export async function runStructuredResearchPrompt<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
	const provider = resolveResearchProvider();
	if (!provider.runStructuredResearch) {
		throw new Error(`Provider "${provider.id}" does not implement structured research`);
	}
	const result = await provider.runStructuredResearch({ prompt, schema });
	return result.object;
}

/** Like {@link runStructuredResearchPrompt} with no web search, for prompts that already carry the data. */
export async function runStructuredCompletionPrompt<T>(
	prompt: string,
	schema: z.ZodType<T>,
): Promise<StructuredResearchResult<T>> {
	const provider = resolveResearchProvider();
	if (!provider.runStructuredResearch) {
		throw new Error(`Provider "${provider.id}" does not implement structured research`);
	}
	return provider.runStructuredResearch({ prompt, schema, webSearch: false });
}
