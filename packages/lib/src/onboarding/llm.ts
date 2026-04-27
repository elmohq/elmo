/**
 * Provider-agnostic onboarding research.
 *
 * Two structured-output strategies live behind one call:
 *
 *   - Direct API providers (Anthropic / OpenAI / OpenRouter) get native
 *     structured outputs via the AI SDK's `generateObject`. The schema is
 *     enforced by the provider; there's no JSON parsing on our side.
 *
 *   - Screen-scraper providers (Olostep / BrightData) drive consumer
 *     chatbots that have no schema mode. Asking the chatbot to research AND
 *     emit JSON in one shot is unreliable — JSON discipline drops as the
 *     model juggles web search, citations, and formatting at the same time.
 *     Instead we do a TWO-PASS scrape:
 *
 *       Pass 1 — research: send the brand-analysis prompt and let the
 *                chatbot answer freely (prose markdown, web search,
 *                citations). No JSON pressure.
 *       Pass 2 — format:   send the research back with a tight "convert
 *                this to JSON matching the schema" prompt. No web search;
 *                pure transformation, which consumer chatbots are reliably
 *                good at.
 *
 *     Pass 2's response goes through AI SDK's `parsePartialJson`, which
 *     repairs trailing prose / unbalanced braces / fence artifacts before
 *     Zod validation. The two-pass costs one extra scraper credit per
 *     onboarding (cheap; runs once per brand) in exchange for far higher
 *     parse-success rates.
 *
 * `ONBOARDING_LLM_TARGET` (parsed like a SCRAPE_TARGETS entry) overrides the
 * preference order if a deployment wants a specific provider.
 */
import { generateObject, NoObjectGeneratedError, parsePartialJson, type LanguageModel } from "ai";
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
	/** Forwarded to AI SDK; only meaningful on the direct-API path. */
	maxRetries?: number;
}

/**
 * Run a research prompt and return a Zod-validated structured response.
 * Direct-API providers use `generateObject`; scrapers go through the
 * two-pass research-then-format chain documented at the top of this file.
 */
export async function runStructuredResearchPrompt<T>(
	prompt: string,
	options: RunStructuredOptions<T>,
): Promise<T> {
	const target = options.target ?? resolveResearchTarget();

	if (target.provider.languageModel) {
		return runStructuredViaDirectApi(target, prompt, options);
	}
	return runStructuredViaScraper(target, prompt, options);
}

async function runStructuredViaDirectApi<T>(
	target: ResearchTarget,
	prompt: string,
	options: RunStructuredOptions<T>,
): Promise<T> {
	const { provider, model } = target;
	if (!provider.languageModel) {
		throw new Error(`Provider "${provider.id}" does not expose a languageModel`);
	}
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

async function runStructuredViaScraper<T>(
	target: ResearchTarget,
	prompt: string,
	options: RunStructuredOptions<T>,
): Promise<T> {
	const research = await target.provider.run(target.model, buildResearchPrompt(prompt), { webSearch: true });
	const format = await target.provider.run(
		target.model,
		buildFormatPrompt({ originalPrompt: prompt, researchText: research.textContent }),
		{ webSearch: false },
	);

	const json = await parseRobustJson(format.textContent);
	return options.schema.parse(json);
}

function buildResearchPrompt(originalPrompt: string): string {
	return `${originalPrompt}

NOTE: For this first pass, focus on producing thorough, accurate research. Use web search if available. Markdown prose is fine — a follow-up step will format the result as JSON, so don't worry about being strict about JSON syntax here.`;
}

function buildFormatPrompt(args: { originalPrompt: string; researchText: string }): string {
	return `You are converting a previous research draft into a single strictly-valid JSON object. Do not perform new research — only restructure what's already in the research text into the requested JSON shape.

ORIGINAL INSTRUCTIONS (defines the JSON schema you must produce):
---
${args.originalPrompt}
---

RESEARCH TEXT (your input data):
---
${args.researchText}
---

Output ONLY the JSON object, wrapped in <out>...</out> tags. No prose outside the tags. No markdown fences. No commentary. Use empty arrays for fields you can't fill from the research.`;
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
// Robust JSON parser for the scraper pass-2 response.
// ---------------------------------------------------------------------------

/**
 * Pull a JSON value out of a chatbot reply. Strips `<out>` wrappers / fences
 * first, then hands off to AI SDK's `parsePartialJson`, which repairs common
 * issues (trailing prose, unbalanced braces, half-closed strings) before we
 * hand the value off to Zod for type-level validation.
 *
 * Exported because `wizard-helpers.ts` still has a couple of legacy callers
 * that build prompts and need to parse the reply themselves.
 */
export async function parseRobustJson(text: string): Promise<unknown> {
	if (!text || !text.trim()) throw new Error("Empty LLM response");

	const candidates = [
		extractTagged(text, "out"),
		extractCodeFence(text),
		extractFirstJsonBlob(text),
		text.trim(),
	].filter((c): c is string => Boolean(c));

	let lastState = "no-candidates";
	for (const candidate of candidates) {
		const result = await parsePartialJson(candidate);
		if (result.state === "successful-parse" || result.state === "repaired-parse") {
			return result.value;
		}
		lastState = result.state;
	}
	throw new Error(`Could not parse JSON from LLM response (last parsePartialJson state: ${lastState}).`);
}

function extractTagged(text: string, tag: string): string | null {
	const re = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, "i");
	const m = text.match(re);
	return m ? stripCodeFence(m[1]) : null;
}

function extractCodeFence(text: string): string | null {
	const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
	return m ? m[1].trim() : null;
}

function extractFirstJsonBlob(text: string): string | null {
	const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
	return m ? m[0] : null;
}

function stripCodeFence(s: string): string {
	const trimmed = s.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
	return fenced ? fenced[1].trim() : trimmed;
}

export type { LanguageModel };
