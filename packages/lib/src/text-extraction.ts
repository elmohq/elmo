/**
 * Functions for extracting text content and citations from stored rawOutput.
 *
 * Each provider stores rawOutput in a different format. These functions handle
 * re-reading that stored data for display in the UI (prompt detail pages, reports).
 *
 * For new prompt runs, the Provider.run() method normalizes output into ScrapeResult
 * at write time, so these functions are primarily for reading historical data.
 */

// ============================================================================
// Text extraction by provider
// ============================================================================

export function extractTextFromOpenAI(rawOutput: any): string {
	try {
		if (rawOutput?.output && Array.isArray(rawOutput.output)) {
			const messageOutputs = rawOutput.output.filter((item: any) => item.type === "message");
			if (messageOutputs.length > 0) {
				const texts: string[] = [];
				for (const messageOutput of messageOutputs) {
					if (messageOutput.content && Array.isArray(messageOutput.content)) {
						for (const c of messageOutput.content) {
							if (c.type === "output_text" && c.text) texts.push(c.text);
						}
					}
				}
				if (texts.length > 0) return texts.join("\n");
			}
		}
		if (rawOutput?.choices?.[0]?.message?.content) return rawOutput.choices[0].message.content;
		if (typeof rawOutput?.text === "string") return rawOutput.text;
		return "No text content found in OpenAI output.";
	} catch (error) {
		console.error("Error extracting text from OpenAI output:", error);
		return "Error extracting text content.";
	}
}

export function extractTextFromAnthropic(rawOutput: any): string {
	try {
		if (rawOutput && Array.isArray(rawOutput.content)) {
			const textBlocks = rawOutput.content.filter((block: any) => block.type === "text");
			return textBlocks.map((block: any) => block.text).join("\n");
		}
		return "No text content found in Anthropic output.";
	} catch (error) {
		console.error("Error extracting text from Anthropic output:", error);
		return "Error extracting text content.";
	}
}

export function extractTextFromGoogle(rawOutput: any): string {
	return extractTextFromDataforseo(rawOutput);
}

/**
 * The `dataforseo` provider routes to three different DataForSEO products, so
 * stored rows under that one provider id carry three shapes. The LLM Scraper is
 * the one that renders its answer as top-level `markdown` and cites through
 * top-level `sources`; neither the LLM Responses nor the SERP results have
 * either field.
 */
function isDataforseoScraperResult(result: any): boolean {
	return typeof result?.markdown === "string" || Array.isArray(result?.sources);
}

export function extractTextFromDataforseo(rawOutput: any): string {
	try {
		const result = rawOutput?.tasks?.[0]?.result?.[0];
		if (result) {
			if (isDataforseoScraperResult(result)) {
				return extractTextFromDataforseoScraper(rawOutput);
			}
			const items = result.items || [];
			// AI Optimization LLM Responses (chatgpt/perplexity/gemini) use
			// items[].sections[].text; the SERP Google AI Mode shape below uses
			// items[].type === "ai_overview". Detect and delegate.
			if (items.some((item: any) => Array.isArray(item?.sections))) {
				return extractTextFromDataforseoLlm(rawOutput);
			}
			const aiOverviewItems = items.filter((item: any) => item.type === "ai_overview");
			if (aiOverviewItems.length > 0 && aiOverviewItems[0].markdown) {
				return aiOverviewItems[0].markdown;
			}
		}
		return "No AI overview content found.";
	} catch (error) {
		console.error("Error extracting text from DataForSEO output:", error);
		return "Error extracting text content.";
	}
}

/**
 * Text extraction for DataForSEO's AI Optimization "LLM Responses" API
 * (chatgpt / perplexity / gemini), which has a different shape from the SERP
 * Google AI Mode response handled by extractTextFromDataforseo:
 *   tasks[].result[].items[].sections[].{type:"text", text}
 * The reasoning items (type "reasoning") are skipped; only message text is kept.
 */
export function extractTextFromDataforseoLlm(rawOutput: any): string {
	try {
		const result = rawOutput?.tasks?.[0]?.result?.[0];
		if (!result) return "No text content found in DataForSEO LLM output.";
		const texts: string[] = [];
		for (const item of result.items ?? []) {
			if (item?.type === "reasoning") continue;
			for (const section of item?.sections ?? []) {
				if (typeof section?.text === "string" && section.text.trim()) {
					texts.push(section.text.trim());
				}
			}
		}
		if (texts.length) return texts.join("\n");
		return "No text content found in DataForSEO LLM output.";
	} catch (error) {
		console.error("Error extracting text from DataForSEO LLM output:", error);
		return "Error extracting text content.";
	}
}

/**
 * Text extraction for DataForSEO's AI Optimization "LLM Scraper" API
 * (chatgpt / gemini). The scraped answer arrives pre-rendered as markdown at
 * tasks[].result[].markdown; items[] carries the same content split into typed
 * blocks (text, tables, product cards), so the top-level field is preferred.
 */
export function extractTextFromDataforseoScraper(rawOutput: any): string {
	try {
		const result = rawOutput?.tasks?.[0]?.result?.[0];
		const markdown = result?.markdown;
		if (typeof markdown === "string" && markdown.trim()) return markdown;
		// Older or partial responses may only populate the per-item blocks. They
		// are separate markdown blocks, so they are joined by a blank line; a
		// single newline is a soft break, which would render consecutive blocks
		// as one run-on paragraph.
		const texts: string[] = [];
		for (const item of result?.items ?? []) {
			if (typeof item?.markdown === "string" && item.markdown.trim()) texts.push(item.markdown.trim());
		}
		if (texts.length) return texts.join("\n\n");
		return "No text content found in DataForSEO Scraper output.";
	} catch (error) {
		console.error("Error extracting text from DataForSEO Scraper output:", error);
		return "Error extracting text content.";
	}
}

/**
 * Citation extraction for DataForSEO's AI Optimization "LLM Scraper" API.
 * tasks[].result[].sources is the deduplicated set the answer actually cited;
 * items[].sources repeats those same entries. ChatGPT's `search_results` is
 * deliberately ignored — those are results the model was shown, not sources it
 * cited.
 */
export function extractCitationsFromDataforseoScraper(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		const result = rawOutput?.tasks?.[0]?.result?.[0];
		const sources = [...asArray(result?.sources), ...asArray(result?.items).flatMap((i: any) => asArray(i?.sources))];
		for (const source of sources) add(source?.url, source?.title);
	});
}

export function extractTextFromMistral(rawOutput: any): string {
	try {
		// Conversations API (web search enabled): outputs[].content[].text chunks.
		if (Array.isArray(rawOutput?.outputs)) {
			const texts: string[] = [];
			for (const entry of rawOutput.outputs) {
				for (const chunk of entry?.content ?? []) {
					if (chunk?.type === "text" && typeof chunk.text === "string") texts.push(chunk.text);
				}
			}
			if (texts.length) return texts.join("\n");
		}
		// Chat Completions API (no web search): OpenAI-shaped.
		if (rawOutput?.choices?.[0]?.message?.content) return rawOutput.choices[0].message.content;
		return "No text content found in Mistral output.";
	} catch {
		return "Error extracting text content.";
	}
}

export function extractTextFromOpenRouter(rawOutput: any): string {
	try {
		if (rawOutput?.choices?.[0]?.message?.content) return rawOutput.choices[0].message.content;
		if (rawOutput?.output && Array.isArray(rawOutput.output)) {
			const texts: string[] = [];
			for (const msg of rawOutput.output.filter((i: any) => i.type === "message")) {
				for (const c of msg.content ?? []) {
					if (c.type === "output_text" && c.text) texts.push(c.text);
				}
			}
			if (texts.length) return texts.join("\n");
		}
		return "No text content found in OpenRouter output.";
	} catch {
		return "Error extracting text content.";
	}
}

export function extractTextFromOlostep(rawOutput: any): string {
	try {
		const jsonStr = rawOutput?.json_content ?? rawOutput?.result?.json_content;
		const parsed = typeof jsonStr === "string" ? JSON.parse(jsonStr) : rawOutput;
		if (parsed?.result?.markdown_content) return parsed.result.markdown_content;
		if (parsed?.answer_markdown) return parsed.answer_markdown;
		if (parsed?.result?.text_content) return parsed.result.text_content;
		if (typeof parsed?.answer === "string") return parsed.answer;
		return "No text content found in Olostep output.";
	} catch {
		return "Error extracting text content.";
	}
}

// BrightData's SERP `ai_overview.texts` is a tree: paragraph blocks carry a
// `snippet`, list blocks nest their items under `list` (which can themselves
// nest), so walk it depth-first and collect snippets in reading order.
function collectAioSnippets(node: any, out: string[], depth = 0): void {
	if (node == null || depth > 8) return;
	if (Array.isArray(node)) {
		for (const child of node) collectAioSnippets(child, out, depth + 1);
		return;
	}
	if (typeof node === "string") {
		if (node.trim()) out.push(node.trim());
		return;
	}
	if (typeof node === "object") {
		if (typeof node.snippet === "string" && node.snippet.trim()) out.push(node.snippet.trim());
		else if (typeof node.text === "string" && node.text.trim()) out.push(node.text.trim());
		for (const key of ["list", "texts", "items", "blocks", "paragraphs"]) {
			if (Array.isArray(node[key])) collectAioSnippets(node[key], out, depth + 1);
		}
	}
}

// Google AI Overview arrives through BrightData's SERP API (brd_json), where the
// overview sits under `ai_overview` rather than the chatbot answer fields.
function extractBrightdataAiOverviewText(record: any): string | null {
	const aio = record?.ai_overview;
	if (!aio || typeof aio !== "object") return null;
	for (const key of ["markdown", "text", "aio_text", "content", "answer"]) {
		if (typeof aio[key] === "string" && aio[key].trim()) return aio[key].trim();
	}
	for (const listKey of ["texts", "items", "text_blocks", "blocks", "paragraphs"]) {
		if (!Array.isArray(aio[listKey])) continue;
		const snippets: string[] = [];
		collectAioSnippets(aio[listKey], snippets);
		// Each snippet is its own block in the overview, so they are separated by
		// a blank line; a single newline is a markdown soft break and would render
		// the whole overview as one run-on paragraph.
		if (snippets.length) return snippets.join("\n\n");
	}
	return null;
}

export function extractTextFromBrightdata(rawOutput: any): string {
	try {
		const record = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
		if (!record) return "No content in BrightData output.";
		const aiOverview = extractBrightdataAiOverviewText(record);
		if (aiOverview) return aiOverview;
		for (const key of [
			"answer_text_markdown",
			"answer_text",
			"answer",
			"response_raw",
			"response",
			"text",
			"content",
		]) {
			if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
		}
		return "No text content found in BrightData output.";
	} catch {
		return "Error extracting text content.";
	}
}

// Google AI Overview via Oxylabs' google_search source. The overview sits in the
// parsed SERP as one or more blocks, each a list of answer fragments that may
// carry reference URLs. The wrapping has shifted across Oxylabs revisions, so
// probe both the nested-results and top-level shapes.
function oxylabsAiOverviews(content: any): any[] {
	const aio = content?.results?.ai_overviews ?? content?.ai_overviews;
	return Array.isArray(aio) ? aio : [];
}

function extractOxylabsAiOverviewText(content: any): string | null {
	const parts: string[] = [];
	const push = (v: any) => {
		if (typeof v === "string" && v.trim()) parts.push(v.trim());
	};
	for (const overview of oxylabsAiOverviews(content)) {
		for (const answer of overview?.answer_text ?? []) {
			if (typeof answer === "string") push(answer);
			for (const fragment of answer?.fragments ?? []) push(fragment?.text);
		}
		if (parts.length === 0) push(overview?.text ?? overview?.markdown);
	}
	return parts.length > 0 ? parts.join("\n\n") : null;
}

export function extractTextFromOxylabs(rawOutput: any): string {
	try {
		const content = rawOutput?.results?.[0]?.content;
		if (!content) return "No content in Oxylabs output.";
		// Google AI Overview (google_search source): prefer the overview block
		// over the SERP's other text fields.
		const aiOverview = extractOxylabsAiOverviewText(content);
		if (aiOverview) return aiOverview;
		for (const key of [
			"markdown_text", // ChatGPT parsed
			"answer_results_md", // Perplexity parsed
			"response_text", // ChatGPT / Google AI Mode fallback
			"answer_text",
			"answer",
		]) {
			if (typeof content[key] === "string" && content[key].trim()) return content[key].trim();
		}
		return "No text content found in Oxylabs output.";
	} catch {
		return "Error extracting text content.";
	}
}

/**
 * The answer object inside a Cloro task `response`, or null when there isn't
 * one. Chatbot tasks (ChatGPT, Perplexity, Copilot, Gemini) and Google AI Mode
 * put the answer at the top level; the Google AI Overview task nests it under
 * `aioverview`, which is null when Google showed no overview.
 */
export function cloroAnswer(rawOutput: any): Record<string, any> | null {
	const answer =
		rawOutput && typeof rawOutput === "object" && "aioverview" in rawOutput ? rawOutput.aioverview : rawOutput;
	return answer && typeof answer === "object" ? answer : null;
}

export function extractTextFromCloro(rawOutput: any): string {
	try {
		const answer = cloroAnswer(rawOutput);
		if (!answer) return "No content in Cloro output.";
		// `markdown` first: the AI Overview task is asked for it explicitly, and
		// `text` is the same answer with its formatting flattened away.
		for (const key of ["markdown", "text"]) {
			if (typeof answer[key] === "string" && answer[key].trim()) return answer[key].trim();
		}
		return "No text content found in Cloro output.";
	} catch {
		return "Error extracting text content.";
	}
}

/**
 * Extract text content from stored rawOutput.
 * Dispatches based on provider (how data was fetched), falling back to engine
 * because persisted runs may not identify a provider.
 */
export function extractTextContent(rawOutput: any, providerOrEngine: string): string {
	switch (providerOrEngine) {
		case "openai-api":
		case "openai":
		case "chatgpt":
			return extractTextFromOpenAI(rawOutput);
		case "anthropic-api":
		case "anthropic":
		case "claude":
			return extractTextFromAnthropic(rawOutput);
		case "mistral-api":
			return extractTextFromMistral(rawOutput);
		case "dataforseo":
		case "google":
		case "google-ai-mode":
		case "google-ai-overview":
			return extractTextFromDataforseo(rawOutput);
		case "openrouter":
			return extractTextFromOpenRouter(rawOutput);
		case "olostep":
			return extractTextFromOlostep(rawOutput);
		case "brightdata":
			return extractTextFromBrightdata(rawOutput);
		case "oxylabs":
			return extractTextFromOxylabs(rawOutput);
		case "cloro":
			return extractTextFromCloro(rawOutput);
		default:
			return tryGenericExtraction(rawOutput);
	}
}

function tryGenericExtraction(rawOutput: any): string {
	if (!rawOutput) return "No content.";
	if (typeof rawOutput === "string") return rawOutput;
	if (rawOutput?.choices?.[0]?.message?.content) return rawOutput.choices[0].message.content;
	if (rawOutput?.answer_markdown) return rawOutput.answer_markdown;
	if (rawOutput?.answer_text) return rawOutput.answer_text;
	if (rawOutput?.content?.[0]?.text) return rawOutput.content[0].text;
	return "Unknown provider format - cannot extract text content.";
}

// ============================================================================
// Citation extraction by provider
// ============================================================================

export type Citation = {
	url: string;
	title?: string;
	domain: string;
	citationIndex: number;
};

function parseCitationUrl(url: string, title: string | undefined, idx: number): Citation | null {
	try {
		const parsed = new URL(url);
		return {
			url,
			title: title || undefined,
			domain: parsed.hostname.replace(/^www\./, ""),
			citationIndex: idx,
		};
	} catch {
		return null;
	}
}

type AddCitation = (url: unknown, title?: unknown) => void;

/** Read a payload field that should hold a list but may be missing or malformed. */
function asArray(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

/** Descend one level into a nested payload, gathering the named list-valued fields. */
function pluck(nodes: any[], ...fields: string[]): any[] {
	return nodes.flatMap((node) => fields.flatMap((field) => asArray(node?.[field])));
}

/** Keep the payload nodes tagged with a given `type`. */
function byType(nodes: any[], type: string): any[] {
	return nodes.filter((node) => node?.type === type);
}

/** Source lists mix bare URL strings with objects that name the URL differently. */
function sourceUrl(item: any, ...fields: string[]): unknown {
	if (typeof item === "string") return item;
	return fields.map((field) => item?.[field]).find((value) => typeof value === "string");
}

/**
 * The provider extractors below differ only in where the URLs sit inside their
 * payload — validating, de-duplicating and indexing them is the same work every
 * time, so it lives here. `traverse` walks the payload and hands each candidate
 * to `add`; a payload malformed enough to throw yields no citations rather than
 * failing the run that produced it.
 */
function collectCitations(traverse: (add: AddCitation) => void): Citation[] {
	const citations: Citation[] = [];
	const seen = new Set<string>();
	const add: AddCitation = (url, title) => {
		if (typeof url !== "string" || !url.startsWith("http") || seen.has(url)) return;
		seen.add(url);
		const citation = parseCitationUrl(url, typeof title === "string" ? title : undefined, citations.length);
		if (citation) citations.push(citation);
	};
	try {
		traverse(add);
	} catch {
		return [];
	}
	return citations;
}

export function extractCitationsFromOpenAI(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		const messages = asArray(rawOutput?.output).filter((message: any) => message?.type === "message");
		const texts = pluck(messages, "content").filter((content: any) => content?.type === "output_text");
		for (const annotation of pluck(texts, "annotations")) {
			if (annotation?.type === "url_citation") add(annotation.url, annotation.title);
		}
	});
}

export function extractCitationsFromGoogle(rawOutput: any): Citation[] {
	return extractCitationsFromDataforseo(rawOutput);
}

export function extractCitationsFromDataforseo(rawOutput: any): Citation[] {
	const result = rawOutput?.tasks?.[0]?.result?.[0];
	if (isDataforseoScraperResult(result)) return extractCitationsFromDataforseoScraper(rawOutput);
	const items = asArray(result?.items);
	// AI Optimization LLM Responses (chatgpt/perplexity/gemini) carry
	// citations in items[].sections[].annotations[]; delegate when present.
	if (items.some((item: any) => Array.isArray(item?.sections))) return extractCitationsFromDataforseoLlm(rawOutput);
	return collectCitations((add) => {
		for (const reference of pluck(byType(items, "ai_overview"), "references")) add(reference?.url, reference?.title);
	});
}

/**
 * Citation extraction for DataForSEO's AI Optimization "LLM Responses" API.
 * Sources live at tasks[].result[].items[].sections[].annotations[].{title,url}.
 * annotations is null when web_search was disabled, and may be empty when web
 * search ran but cited nothing. Duplicate URLs are de-duped.
 */
export function extractCitationsFromDataforseoLlm(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		const items = asArray(rawOutput?.tasks?.[0]?.result?.[0]?.items);
		for (const annotation of pluck(pluck(items, "sections"), "annotations")) add(annotation?.url, annotation?.title);
	});
}

export function extractCitationsFromMistral(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		for (const chunk of pluck(asArray(rawOutput?.outputs), "content")) {
			if (chunk?.type === "tool_reference") add(chunk.url, chunk.title);
		}
	});
}

export function extractCitationsFromOpenRouter(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		for (const annotation of asArray(rawOutput?.choices?.[0]?.message?.annotations)) {
			if (annotation?.type !== "url_citation") continue;
			const cite = annotation.url_citation ?? annotation;
			add(cite?.url, cite?.title);
		}
	});
}

export function extractCitationsFromOlostep(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		const jsonStr = rawOutput?.json_content ?? rawOutput?.result?.json_content;
		const parsed = typeof jsonStr === "string" ? JSON.parse(jsonStr) : rawOutput;
		const sources = parsed?.sources ?? parsed?.result?.links_on_page ?? parsed?.inline_references;
		for (const source of asArray(sources)) {
			if (typeof source === "string") add(source);
			else add(source?.url, source?.title ?? source?.label);
		}
	});
}

export function extractCitationsFromAnthropic(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		const blocks = asArray(rawOutput?.content);
		for (const cit of pluck(byType(blocks, "text"), "citations")) {
			if (cit?.type === "web_search_result_location") add(cit.url, cit.title);
		}
		for (const result of pluck(byType(blocks, "web_search_tool_result"), "content")) {
			if (result?.type === "web_search_result") add(result.url, result.title);
		}
	});
}

// BrightData suffixes AI Overview reference titles with UI noise like
// ". Opens in new tab." Cut it at a plain indexOf and trim the trailing
// punctuation — no backtracking regex over the (uncontrolled) title.
function stripAioTitleNoise(title: string): string {
	const marker = title.toLowerCase().indexOf("opens in new tab");
	if (marker === -1) return title.trim();
	return title
		.slice(0, marker)
		.replace(/[.\s]+$/, "")
		.trim();
}

export function extractCitationsFromBrightdata(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		const record = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
		// SERP API (Google AI Overview) lists its sources under `ai_overview`, where
		// each reference carries the URL as `href` and a title suffixed with UI noise
		// (". Opens in new tab.") that we trim off.
		for (const item of pluck([record?.ai_overview], "references", "source_links", "sources", "links")) {
			const title = typeof item?.title === "string" ? stripAioTitleNoise(item.title) : item?.name;
			add(sourceUrl(item, "href", "url", "link"), title);
		}
		// Chatbot dataset citation fields.
		for (const item of pluck([record], "citations", "links_attached", "sources")) {
			add(sourceUrl(item, "url"), item?.title);
		}
	});
}

export function extractCitationsFromOxylabs(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		const content = rawOutput?.results?.[0]?.content;
		// Common citation fields across Oxylabs parsed AI sources.
		// - ChatGPT: top-level `citations` with `{ url, title }`
		// - Google AI Mode: top-level `citations` with `{ text, urls: [...] }`
		// - Perplexity: nested under `additional_results.sources_results`
		const sources = pluck([content], "citations", "external_links", "links", "sources").concat(
			pluck([content?.additional_results], "sources_results"),
		);
		for (const item of sources) {
			const title = item?.title ?? item?.name;
			// Google AI Mode groups one or more source URLs under each citation.
			for (const url of asArray(item?.urls)) add(url, title);
			if (!Array.isArray(item?.urls)) add(sourceUrl(item, "url", "link"), title);
		}

		// Google AI Overview references hang off each answer fragment, with any
		// extra sources listed in the overview's source panel.
		const overviews = oxylabsAiOverviews(content);
		for (const ref of pluck(pluck(pluck(overviews, "answer_text"), "fragments"), "references")) {
			add(ref?.url, ref?.source);
		}
		for (const item of overviews.flatMap((o: any) => asArray(o?.source_panel?.items))) {
			add(sourceUrl(item, "url", "link"), item?.title ?? item?.source);
		}
	});
}

export function extractCitationsFromCloro(rawOutput: any): Citation[] {
	return collectCitations((add) => {
		// `sources` is the answer's reference panel and `citationPills` are the
		// inline citations (a denormalized subset). Each entry exposes the source
		// URL as `url` and its title as `label`. AI Overview's `relatedLinks` is
		// the block of links Google offers alongside the answer, not sources it
		// drew on, so it is not read.
		//
		// Google's own Shopping deep links do turn up inside these two fields, and
		// they stay: the citations page splits them out of the source mix by URL
		// and builds the Google Shopping module from them.
		for (const item of pluck([cloroAnswer(rawOutput)], "sources", "citationPills")) {
			add(sourceUrl(item, "url", "link"), item?.label ?? item?.title);
		}
	});
}

/**
 * Extract citations from stored rawOutput.
 * Dispatches based on provider (how data was fetched), falling back to engine
 * because persisted runs may not identify a provider.
 */
export function extractCitations(rawOutput: any, providerOrEngine: string): Citation[] {
	switch (providerOrEngine) {
		case "openai-api":
		case "openai":
		case "chatgpt":
			return extractCitationsFromOpenAI(rawOutput);
		case "dataforseo":
		case "google":
		case "google-ai-mode":
		case "google-ai-overview":
			return extractCitationsFromDataforseo(rawOutput);
		case "openrouter":
			return extractCitationsFromOpenRouter(rawOutput);
		case "olostep":
			return extractCitationsFromOlostep(rawOutput);
		case "brightdata":
			return extractCitationsFromBrightdata(rawOutput);
		case "oxylabs":
			return extractCitationsFromOxylabs(rawOutput);
		case "cloro":
			return extractCitationsFromCloro(rawOutput);
		case "anthropic-api":
		case "anthropic":
		case "claude":
			return extractCitationsFromAnthropic(rawOutput);
		case "mistral-api":
			return extractCitationsFromMistral(rawOutput);
		default:
			return [];
	}
}
