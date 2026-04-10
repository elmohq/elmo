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

export function extractTextFromDataforseo(rawOutput: any): string {
	try {
		if (rawOutput?.tasks?.[0]?.result?.[0]) {
			const items = rawOutput.tasks[0].result[0].items || [];
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
		const parsed = rawOutput?.result?.json_content ? JSON.parse(rawOutput.result.json_content) : rawOutput;
		if (parsed?.result?.markdown_content) return parsed.result.markdown_content;
		if (parsed?.answer_markdown) return parsed.answer_markdown;
		if (parsed?.result?.text_content) return parsed.result.text_content;
		if (typeof parsed?.answer === "string") return parsed.answer;
		return "No text content found in Olostep output.";
	} catch {
		return "Error extracting text content.";
	}
}

export function extractTextFromBrightdata(rawOutput: any): string {
	try {
		const record = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
		if (!record) return "No content in BrightData output.";
		for (const key of ["answer_text", "answer_text_markdown", "answer", "response_raw", "response", "text", "content"]) {
			if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
		}
		return "No text content found in BrightData output.";
	} catch {
		return "Error extracting text content.";
	}
}

/**
 * Extract text content from stored rawOutput.
 * Dispatches based on provider (how data was fetched), falling back to engine
 * (for old data where provider column may be null).
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

export function extractCitationsFromOpenAI(rawOutput: any): Citation[] {
	try {
		const citations: Citation[] = [];
		let idx = 0;
		if (rawOutput?.output && Array.isArray(rawOutput.output)) {
			for (const msg of rawOutput.output.filter((i: any) => i.type === "message")) {
				for (const content of msg.content ?? []) {
					if (content.type === "output_text" && Array.isArray(content.annotations)) {
						for (const ann of content.annotations) {
							if (ann.type === "url_citation" && ann.url) {
								const c = parseCitationUrl(ann.url, ann.title, idx);
								if (c) { citations.push(c); idx++; }
							}
						}
					}
				}
			}
		}
		return citations;
	} catch {
		return [];
	}
}

export function extractCitationsFromGoogle(rawOutput: any): Citation[] {
	return extractCitationsFromDataforseo(rawOutput);
}

export function extractCitationsFromDataforseo(rawOutput: any): Citation[] {
	try {
		const citations: Citation[] = [];
		let idx = 0;
		const items = rawOutput?.tasks?.[0]?.result?.[0]?.items ?? [];
		for (const aiOverview of items.filter((i: any) => i.type === "ai_overview")) {
			for (const ref of aiOverview.references ?? []) {
				if (ref.url) {
					const c = parseCitationUrl(ref.url, ref.title, idx);
					if (c) { citations.push(c); idx++; }
				}
			}
		}
		return citations;
	} catch {
		return [];
	}
}

export function extractCitationsFromOpenRouter(rawOutput: any): Citation[] {
	try {
		const citations: Citation[] = [];
		let idx = 0;
		for (const ann of rawOutput?.choices?.[0]?.message?.annotations ?? []) {
			if (ann?.type === "url_citation" && ann.url) {
				const c = parseCitationUrl(ann.url, ann.title, idx);
				if (c) { citations.push(c); idx++; }
			}
		}
		return citations;
	} catch {
		return [];
	}
}

export function extractCitationsFromOlostep(rawOutput: any): Citation[] {
	try {
		const parsed = rawOutput?.result?.json_content ? JSON.parse(rawOutput.result.json_content) : rawOutput;
		const citations: Citation[] = [];
		let idx = 0;
		for (const source of parsed?.sources ?? parsed?.result?.links_on_page ?? parsed?.inline_references ?? []) {
			const url = typeof source === "string" ? source : source?.url;
			if (url && typeof url === "string") {
				const c = parseCitationUrl(url, source?.title ?? source?.label, idx);
				if (c) { citations.push(c); idx++; }
			}
		}
		return citations;
	} catch {
		return [];
	}
}

export function extractCitationsFromBrightdata(rawOutput: any): Citation[] {
	try {
		const record = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
		if (!record) return [];
		const citations: Citation[] = [];
		const seen = new Set<string>();
		let idx = 0;
		for (const field of ["citations", "links_attached", "sources"]) {
			if (!Array.isArray(record[field])) continue;
			for (const item of record[field]) {
				const url = typeof item === "string" ? item : item?.url;
				if (!url || typeof url !== "string" || !url.startsWith("http") || seen.has(url)) continue;
				seen.add(url);
				const c = parseCitationUrl(url, item?.title, idx);
				if (c) { citations.push(c); idx++; }
			}
		}
		return citations;
	} catch {
		return [];
	}
}

/**
 * Extract citations from stored rawOutput.
 * Dispatches based on provider (how data was fetched), falling back to engine
 * (for old data where provider column may be null).
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
		case "anthropic-api":
		case "anthropic":
		case "claude":
			return [];
		default:
			return [];
	}
}
