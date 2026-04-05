// Helper functions for extracting text content from different AI model outputs

export function extractTextFromOpenAI(rawOutput: any): string {
	try {
		// For OpenAI Responses API, check the output array for message content
		if (rawOutput && rawOutput.output && Array.isArray(rawOutput.output)) {
			const messageOutputs = rawOutput.output.filter((item: any) => item.type === "message");
			if (messageOutputs.length > 0) {
				const texts: string[] = [];
				for (const messageOutput of messageOutputs) {
					if (messageOutput.content && Array.isArray(messageOutput.content)) {
						const textContents = messageOutput.content.filter((content: any) => content.type === "output_text");
						for (const textContent of textContents) {
							if (textContent.text) {
								texts.push(textContent.text);
							}
						}
					}
				}
				if (texts.length > 0) {
					return texts.join("\n");
				}
			}
		}

		// Check for other possible structures in response body
		if (rawOutput && rawOutput.choices && Array.isArray(rawOutput.choices)) {
			if (rawOutput.choices[0]?.message?.content) {
				return rawOutput.choices[0].message.content;
			}
		}

		// Fallback: check if there's a direct text property
		if (rawOutput && typeof rawOutput.text === "string") {
			return rawOutput.text;
		}

		return "No text content found in OpenAI output.";
	} catch (error) {
		console.error("Error extracting text from OpenAI output:", error);
		return "Error extracting text content.";
	}
}

export function extractTextFromAnthropic(rawOutput: any): string {
	try {
		// Anthropic uses response.content with text blocks
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
	try {
		// DataForSEO uses AI overview markdown
		if (rawOutput && rawOutput.tasks && rawOutput.tasks.length > 0) {
			const task = rawOutput.tasks[0];
			if (task.result && task.result.length > 0) {
				const result = task.result[0];
				const items = result.items || [];
				const aiOverviewItems = items.filter((item: any) => item.type === "ai_overview");

				if (aiOverviewItems.length > 0 && aiOverviewItems[0].markdown) {
					return aiOverviewItems[0].markdown;
				}
			}
		}
		return "No AI overview content found.";
	} catch (error) {
		console.error("Error extracting text from Google output:", error);
		return "Error extracting text content.";
	}
}

export function extractTextContent(rawOutput: any, engine: string): string {
	switch (engine) {
		case "openai":
		case "chatgpt":
			return extractTextFromOpenAI(rawOutput);
		case "anthropic":
		case "claude":
			return extractTextFromAnthropic(rawOutput);
		case "google":
		case "google-ai-mode":
		case "google-ai-overview":
			return extractTextFromGoogle(rawOutput);
		default:
			return "Unknown engine - cannot extract text content.";
	}
}

// Citation extraction types
export type Citation = {
	url: string;
	title?: string;
	domain: string;
	citationIndex: number;
};

export function extractCitationsFromOpenAI(rawOutput: any): Citation[] {
	try {
		const citations: Citation[] = [];
		let idx = 0;
		
		if (rawOutput && rawOutput.output && Array.isArray(rawOutput.output)) {
			const messageOutputs = rawOutput.output.filter((item: any) => item.type === "message");
			
			for (const messageOutput of messageOutputs) {
				if (messageOutput.content && Array.isArray(messageOutput.content)) {
					for (const content of messageOutput.content) {
						if (content.type === "output_text" && content.annotations && Array.isArray(content.annotations)) {
							for (const annotation of content.annotations) {
								if (annotation.type === "url_citation" && annotation.url) {
									try {
										const url = new URL(annotation.url);
										citations.push({
											url: annotation.url,
											title: annotation.title || undefined,
											domain: url.hostname.replace(/^www\./, ''),
											citationIndex: idx,
										});
										idx++;
									} catch (e) {
										console.warn("Invalid citation URL:", annotation.url);
									}
								}
							}
						}
					}
				}
			}
		}
		
		return citations;
	} catch (error) {
		console.error("Error extracting citations from OpenAI output:", error);
		return [];
	}
}

export function extractCitationsFromGoogle(rawOutput: any): Citation[] {
	try {
		const citations: Citation[] = [];
		let idx = 0;
		
		if (rawOutput && rawOutput.tasks && rawOutput.tasks.length > 0) {
			const task = rawOutput.tasks[0];
			if (task.result && task.result.length > 0) {
				const result = task.result[0];
				const items = result.items || [];
				const aiOverviewItems = items.filter((item: any) => item.type === "ai_overview");
				
				for (const aiOverview of aiOverviewItems) {
					if (aiOverview.references && Array.isArray(aiOverview.references)) {
						for (const ref of aiOverview.references) {
							if (ref.url) {
								try {
									const url = new URL(ref.url);
									citations.push({
										url: ref.url,
										title: ref.title || undefined,
										domain: url.hostname.replace(/^www\./, ''),
										citationIndex: idx,
									});
									idx++;
								} catch (e) {
									console.warn("Invalid citation URL:", ref.url);
								}
							}
						}
					}
				}
			}
		}
		
		return citations;
	} catch (error) {
		console.error("Error extracting citations from Google output:", error);
		return [];
	}
}

export function extractCitations(rawOutput: any, engine: string): Citation[] {
	switch (engine) {
		case "openai":
		case "chatgpt":
			return extractCitationsFromOpenAI(rawOutput);
		case "google":
		case "google-ai-mode":
		case "google-ai-overview":
			return extractCitationsFromGoogle(rawOutput);
		case "anthropic":
		case "claude":
			return [];
		default:
			return [];
	}
}
