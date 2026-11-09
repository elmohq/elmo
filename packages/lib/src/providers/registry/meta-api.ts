import { getCredential } from "../../secrets";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, configuredWhen, reportedWebQueries, warnIfOutputCapped } from "../config";
import type { Provider, ProviderOptions, ScrapeResult } from "../types";
import { nonEmptyStrings } from "./scrape-shared";

// Meta's Model API speaks the OpenAI Responses format, so stored runs read back
// with the OpenAI extractor.
const META_RESPONSES_URL = "https://api.meta.ai/v1/responses";

function webSearchQueries(output: unknown): string[] {
	if (!Array.isArray(output)) return [];
	return output.flatMap((item) => {
		if (item?.type !== "web_search_call" || item.action?.type !== "search") return [];
		return nonEmptyStrings([item.action.query, ...(item.action.queries ?? [])]);
	});
}

async function runMeta(prompt: string, model: string, options?: ProviderOptions): Promise<ScrapeResult> {
	const webSearch = options?.webSearch === true;
	const res = await fetch(META_RESPONSES_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getCredential("META_API_KEY")}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			input: prompt,
			max_output_tokens: API_PROVIDER_MAX_OUTPUT_TOKENS["meta-api"],
			...(webSearch ? { tools: [{ type: "web_search" }] } : {}),
		}),
	});

	if (!res.ok) {
		throw new Error(`Meta Model API error (${res.status}): ${await res.text()}`);
	}

	const data: any = await res.json();

	if (data?.status === "incomplete" && data?.incomplete_details?.reason === "max_output_tokens") {
		warnIfOutputCapped("meta-api", model, "length");
	}

	return {
		rawOutput: data,
		webQueries: reportedWebQueries(webSearchQueries(data?.output), { webSearch }),
		modelVersion: data?.model ?? model,
	};
}

export const metaApi: Provider = {
	id: "meta-api",
	name: "Meta Model API",
	access: "api",
	docsAnchor: "direct-model-apis",

	isConfigured: configuredWhen("META_API_KEY"),

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		if (!options?.version) {
			throw new Error(
				`Meta Model API requires a version slug in SCRAPE_TARGETS. Example: ${model}:meta-api:muse-spark-1.1:online`,
			);
		}
		return runMeta(prompt, options.version, options);
	},
};
