import { ProviderResponseError } from "./providers";
import { extractCitations, extractTextContent } from "./text-extraction";

export interface StoredProviderResult {
	rawOutput: unknown;
	textContent: string;
	webQueries: string[];
	citations: Array<{
		url: string;
		domain: string;
		title?: string;
		citationIndex: number;
	}>;
	modelVersion?: string;
}

export interface StoredRawProviderResponse {
	rawResponseOnly: true;
	rawOutput: unknown;
	modelVersion?: string;
}

export type StoredProviderPayload = StoredProviderResult | StoredRawProviderResponse;

const JSON_TEXT_PROVIDERS = new Set(["brightdata", "mistral-api", "olostep", "openrouter"]);
const EXTRACTION_FAILURES = ["Error extracting", "Unknown provider format"];

export function validateProviderResult(result: StoredProviderResult): StoredProviderResult {
	if (
		typeof result.textContent !== "string" ||
		!Array.isArray(result.webQueries) ||
		!Array.isArray(result.citations) ||
		EXTRACTION_FAILURES.some((marker) => result.textContent.startsWith(marker))
	) {
		throw new ProviderResponseError("Provider returned a response that could not be normalized safely");
	}
	return result;
}

export function normalizeStoredProviderPayload(provider: string, payload: StoredProviderPayload): StoredProviderResult {
	if (!("rawResponseOnly" in payload) || payload.rawResponseOnly !== true) {
		return validateProviderResult(payload as StoredProviderResult);
	}

	let extractionInput = payload.rawOutput;
	if (typeof extractionInput === "string" && JSON_TEXT_PROVIDERS.has(provider)) {
		try {
			extractionInput = JSON.parse(extractionInput);
		} catch (error) {
			throw new ProviderResponseError(`Provider ${provider} returned malformed JSON`, { cause: error });
		}
	}

	return validateProviderResult({
		rawOutput: payload.rawOutput,
		textContent: extractTextContent(extractionInput, provider),
		citations: extractCitations(extractionInput, provider),
		webQueries: [],
		modelVersion: payload.modelVersion,
	});
}
