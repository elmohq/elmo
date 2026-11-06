import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getCredential } from "../../secrets";
import { extractCitationsFromGemini } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, configuredWhen, reportedWebQueries, warnIfOutputCapped } from "../config";
import type {
	Provider,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "../types";
import { structuredResearch } from "./ai-sdk";
import { nonEmptyStrings, resolveGroundingRedirects, sanitizeForJson } from "./scrape-shared";

const DEFAULT_MODEL = "gemini-3.8-flash";

function getGeminiModel(model: string) {
	return createGoogleGenerativeAI({ apiKey: getCredential("GEMINI_API_KEY") })(model);
}

/** The slice of a generateContent response that the stored run is read from. */
type GeminiPayload = {
	candidates?: {
		content?: { parts?: { text?: string }[] };
		groundingMetadata?: {
			webSearchQueries?: string[] | null;
			groundingChunks?: { web?: { uri?: string; title?: string | null } | null }[] | null;
			searchEntryPoint?: unknown;
		} | null;
	}[];
};

function isGenerateContentPayload(body: unknown): body is GeminiPayload {
	return Array.isArray((body as { candidates?: unknown } | null | undefined)?.candidates);
}

/**
 * The SDK normally hands back the response body as Google sent it; when it
 * doesn't, rebuild the same shape from what the SDK parsed so extraction reads
 * one format either way.
 */
function rebuildPayload(
	result: Pick<Awaited<ReturnType<typeof generateText>>, "text" | "sources" | "providerMetadata">,
): GeminiPayload {
	const groundingChunks = result.sources
		.filter((source): source is typeof source & { url: string; title?: string } => source.sourceType === "url")
		.map((source) => ({ web: { uri: source.url, title: source.title ?? null } }));
	const grounding = result.providerMetadata?.google?.groundingMetadata as
		| { webSearchQueries?: string[] | null }
		| undefined;
	return {
		candidates: [
			{
				content: { parts: [{ text: result.text }] },
				groundingMetadata: { webSearchQueries: grounding?.webSearchQueries ?? [], groundingChunks },
			},
		],
	};
}

async function runGemini(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const webSearch = options?.webSearch === true;

	// Google Search grounding has no per-call search budget, so the output cap is
	// the only bound on a grounded run.
	const result = await generateText({
		model: getGeminiModel(model),
		prompt,
		maxOutputTokens: API_PROVIDER_MAX_OUTPUT_TOKENS["gemini-api"],
		...(webSearch ? { tools: { google_search: google.tools.googleSearch({}) } } : {}),
	});

	warnIfOutputCapped("gemini-api", model, result.finishReason);

	const body = result.response?.body;
	const payload = sanitizeForJson(isGenerateContentPayload(body) ? body : rebuildPayload(result)) as GeminiPayload;
	const grounding = payload.candidates?.[0]?.groundingMetadata;
	if (grounding) {
		// The search-suggestions widget is several KB of HTML and CSS per run, and
		// nothing reads it back.
		delete grounding.searchEntryPoint;
		const sources = (grounding.groundingChunks ?? []).flatMap((chunk) => (chunk?.web ? [chunk.web] : []));
		await resolveGroundingRedirects(sources, "uri");
	}

	return {
		rawOutput: payload,
		webQueries: reportedWebQueries(nonEmptyStrings(grounding?.webSearchQueries), {
			webSearch,
			searchProven: extractCitationsFromGemini(payload).length > 0,
		}),
		modelVersion: model,
	};
}

export const geminiApi: Provider = {
	id: "gemini-api",
	name: "Gemini API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("GEMINI_API_KEY"),

	async run(_model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		return runGemini(prompt, options?.version ?? DEFAULT_MODEL, options);
	},

	async runStructuredResearch<T>({
		prompt,
		schema,
		webSearch = true,
	}: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		const object = await structuredResearch(getGeminiModel(DEFAULT_MODEL), {
			prompt,
			schema,
			...(webSearch ? { tools: { google_search: google.tools.googleSearch({}) } } : {}),
		});
		return { object, modelVersion: DEFAULT_MODEL };
	},
};
