import { googleLanguageCode, type Market } from "@workspace/config/markets";
import Olostep from "olostep";
import { getCredential } from "../../secrets";
import { type Citation, normalizeCitationTitle } from "../../text-extraction";
import { configuredWhen, reportedWebQueries } from "../config";
import type { ModelConfig, Provider, ProviderOptions, ScrapeResult } from "../types";
import { nonEmptyStrings } from "./scrape-shared";

interface OlostepParser {
	parserId: string;
	urlTemplate: (q: string) => string;
	credits: number;
	/** Google reads its interface language off the URL. */
	googleUrl?: boolean;
	/** Countries in Elmo's list that the parser's own country list leaves out. */
	unservedCountries?: readonly string[];
}

const OLOSTEP_PARSERS: Record<string, OlostepParser> = {
	chatgpt: {
		parserId: "@olostep/chatgpt-results",
		urlTemplate: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`,
		credits: 5,
		unservedCountries: ["HK"],
	},
	"google-ai-mode": {
		parserId: "@olostep/google-aimode-results",
		urlTemplate: (q) => `https://google.com/aimode?q=${encodeURIComponent(q)}`,
		credits: 3,
		googleUrl: true,
	},
	"google-ai-overview": {
		parserId: "@olostep/google-ai-overview-results",
		urlTemplate: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
		credits: 3,
		googleUrl: true,
	},
	gemini: {
		parserId: "@olostep/gemini-results",
		urlTemplate: (q) => `https://gemini.google.com/?q=${encodeURIComponent(q)}`,
		credits: 3,
		unservedCountries: ["LU", "CY", "BG", "QA", "KW", "KE"],
	},
};

function requestUrl(parser: OlostepParser, prompt: string, market: Market | undefined): string {
	const url = parser.urlTemplate(prompt);
	if (!market || !parser.googleUrl) return url;
	return `${url}&gl=${market.country.toLowerCase()}&hl=${googleLanguageCode(market)}`;
}

let _client: Olostep | null = null;
let _clientApiKey: string | undefined;
function getClient(): Olostep {
	// Re-key the memoized client on the credential so a refreshed overlay
	// (DB-stored key) takes effect without a process restart.
	const apiKey = getCredential("OLOSTEP_API_KEY");
	if (!_client || _clientApiKey !== apiKey) {
		_client = new Olostep({ apiKey, retry: { maxRetries: 3, initialDelayMs: 2000 } });
		_clientApiKey = apiKey;
	}
	return _client;
}

function extractCitationsFromOlostep(data: any): Citation[] {
	const citations: Citation[] = [];
	const sources = data?.sources ?? data?.citations ?? data?.result?.links_on_page ?? data?.inline_references ?? [];
	let idx = 0;
	for (const source of Array.isArray(sources) ? sources : []) {
		const url = typeof source === "string" ? source : source?.url;
		if (!url || typeof url !== "string") continue;
		try {
			const parsed = new URL(url);
			citations.push({
				url,
				title: normalizeCitationTitle(source?.title ?? source?.label),
				domain: parsed.hostname.replace(/^www\./, ""),
				citationIndex: idx++,
			});
		} catch (e) {
			console.warn(`Olostep: skipping invalid citation URL: ${url}`, e);
		}
	}
	return citations;
}

function extractWebQueries(data: any): string[] {
	// Batch API returns a flat string array at data.search_queries.
	const flat = nonEmptyStrings(data?.search_queries);
	if (flat.length > 0) return flat;

	// Scrape API nests them under network_search_calls or search_model_queries,
	// as either bare strings or objects carrying the query.
	const calls = data?.network_search_calls?.search_queries ?? data?.search_model_queries;
	return nonEmptyStrings(
		(Array.isArray(calls) ? calls : []).map((call) => (typeof call === "string" ? call : call?.query)),
	);
}

export const olostep: Provider = {
	id: "olostep",
	name: "Olostep",
	access: "scraped",
	docsAnchor: "olostep",

	isConfigured: configuredWhen("OLOSTEP_API_KEY"),

	validateTarget(config: ModelConfig) {
		if (!OLOSTEP_PARSERS[config.model]) {
			return `Olostep does not support model "${config.model}". Supported: ${Object.keys(OLOSTEP_PARSERS).join(", ")}`;
		}
		if (!config.webSearch) {
			return `${config.model}:olostep requires :online — these chatbots always use web search`;
		}
		return null;
	},

	localizes(config: ModelConfig, country: string) {
		return !OLOSTEP_PARSERS[config.model]?.unservedCountries?.includes(country);
	},

	sendsLanguage(config: ModelConfig) {
		return OLOSTEP_PARSERS[config.model]?.googleUrl ?? false;
	},

	async run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult> {
		const parserConfig = OLOSTEP_PARSERS[model];
		if (!parserConfig) throw new Error(`Olostep does not support model "${model}"`);

		const client = getClient();
		const url = requestUrl(parserConfig, prompt, options?.market);

		// Use batch API — the /scrapes endpoint doesn't support all parsers
		const batch = await client.batches.create([{ url, customId: "1" }], {
			parser: { id: parserConfig.parserId },
			...(options?.market ? { country: options.market.country } : {}),
		});

		await batch.waitTillDone({ checkEveryNSecs: 5, timeoutSeconds: 1200 });

		let retrieveId: string | undefined;
		for await (const item of batch.items()) {
			retrieveId = item.retrieve_id;
			break; // single item batch
		}

		if (!retrieveId) throw new Error("Olostep batch completed but no items returned");

		// Use client.retrieve (GET) instead of item.retrieve (POST) — the
		// SDK's BatchItem.retrieve uses POST which the API rejects with 403.
		const retrieved = await client.retrieve(retrieveId, ["json" as any]);

		const jsonContent = retrieved.json_content;
		const parsed = typeof jsonContent === "string" ? JSON.parse(jsonContent) : (jsonContent ?? retrieved);

		const webQueries = extractWebQueries(parsed);
		const citations = extractCitationsFromOlostep(parsed);

		return {
			// Store the parsed content directly instead of the full retrieved
			// wrapper (which double-encodes json_content as a string).
			rawOutput: parsed,
			webQueries: reportedWebQueries(webQueries, { searchProven: citations.length > 0 }),
			modelVersion: parsed?.model ?? undefined,
		};
	},
};
