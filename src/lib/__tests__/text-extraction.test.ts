import { describe, it, expect } from "vitest";
import {
	extractTextFromOpenAI,
	extractTextFromAnthropic,
	extractTextFromGoogle,
	extractTextContent,
	extractCitationsFromOpenAI,
	extractCitationsFromGoogle,
	extractCitations,
} from "../text-extraction";

describe("text-extraction", () => {
	describe("extractTextFromOpenAI", () => {
		it("should extract text from Responses API format", () => {
			const rawOutput = {
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								text: "Hello, world!",
							},
						],
					},
				],
			};

			expect(extractTextFromOpenAI(rawOutput)).toBe("Hello, world!");
		});

		it("should extract and join multiple text blocks", () => {
			const rawOutput = {
				output: [
					{
						type: "message",
						content: [
							{ type: "output_text", text: "First part." },
							{ type: "output_text", text: "Second part." },
						],
					},
				],
			};

			expect(extractTextFromOpenAI(rawOutput)).toBe("First part.\nSecond part.");
		});

		it("should extract text from choices format (legacy)", () => {
			const rawOutput = {
				choices: [
					{
						message: {
							content: "Legacy format content",
						},
					},
				],
			};

			expect(extractTextFromOpenAI(rawOutput)).toBe("Legacy format content");
		});

		it("should extract from direct text property", () => {
			const rawOutput = {
				text: "Direct text property",
			};

			expect(extractTextFromOpenAI(rawOutput)).toBe("Direct text property");
		});

		it("should handle missing content gracefully", () => {
			expect(extractTextFromOpenAI({})).toBe("No text content found in OpenAI output.");
			expect(extractTextFromOpenAI(null)).toBe("No text content found in OpenAI output.");
			expect(extractTextFromOpenAI({ output: [] })).toBe("No text content found in OpenAI output.");
		});

		it("should filter non-message output types", () => {
			const rawOutput = {
				output: [
					{ type: "function_call", content: "not this" },
					{
						type: "message",
						content: [{ type: "output_text", text: "Actual text" }],
					},
				],
			};

			expect(extractTextFromOpenAI(rawOutput)).toBe("Actual text");
		});
	});

	describe("extractTextFromAnthropic", () => {
		it("should extract text from content array", () => {
			const rawOutput = {
				content: [
					{ type: "text", text: "Anthropic response" },
				],
			};

			expect(extractTextFromAnthropic(rawOutput)).toBe("Anthropic response");
		});

		it("should join multiple text blocks", () => {
			const rawOutput = {
				content: [
					{ type: "text", text: "First block" },
					{ type: "text", text: "Second block" },
				],
			};

			expect(extractTextFromAnthropic(rawOutput)).toBe("First block\nSecond block");
		});

		it("should filter non-text content types", () => {
			const rawOutput = {
				content: [
					{ type: "tool_use", text: "not this" },
					{ type: "text", text: "Only text" },
				],
			};

			expect(extractTextFromAnthropic(rawOutput)).toBe("Only text");
		});

		it("should handle missing content gracefully", () => {
			expect(extractTextFromAnthropic({})).toBe("No text content found in Anthropic output.");
			expect(extractTextFromAnthropic(null)).toBe("No text content found in Anthropic output.");
			expect(extractTextFromAnthropic({ content: "not an array" })).toBe(
				"No text content found in Anthropic output."
			);
		});
	});

	describe("extractTextFromGoogle", () => {
		it("should extract AI overview markdown from DataForSEO format", () => {
			const rawOutput = {
				tasks: [
					{
						result: [
							{
								items: [
									{
										type: "ai_overview",
										markdown: "AI Overview content here",
									},
								],
							},
						],
					},
				],
			};

			expect(extractTextFromGoogle(rawOutput)).toBe("AI Overview content here");
		});

		it("should handle missing AI overview", () => {
			const rawOutput = {
				tasks: [
					{
						result: [
							{
								items: [
									{ type: "organic", title: "Not AI overview" },
								],
							},
						],
					},
				],
			};

			expect(extractTextFromGoogle(rawOutput)).toBe("No AI overview content found.");
		});

		it("should handle empty structure gracefully", () => {
			expect(extractTextFromGoogle({})).toBe("No AI overview content found.");
			expect(extractTextFromGoogle({ tasks: [] })).toBe("No AI overview content found.");
			expect(extractTextFromGoogle({ tasks: [{ result: [] }] })).toBe("No AI overview content found.");
		});
	});

	describe("extractTextContent", () => {
		it("should route to correct extractor based on model group", () => {
			const openaiOutput = {
				output: [
					{ type: "message", content: [{ type: "output_text", text: "OpenAI text" }] },
				],
			};
			const anthropicOutput = {
				content: [{ type: "text", text: "Anthropic text" }],
			};
			const googleOutput = {
				tasks: [{ result: [{ items: [{ type: "ai_overview", markdown: "Google text" }] }] }],
			};

			expect(extractTextContent(openaiOutput, "openai")).toBe("OpenAI text");
			expect(extractTextContent(anthropicOutput, "anthropic")).toBe("Anthropic text");
			expect(extractTextContent(googleOutput, "google")).toBe("Google text");
		});

		it("should handle unknown model group", () => {
			expect(extractTextContent({}, "unknown")).toBe("Unknown model group - cannot extract text content.");
		});
	});

	describe("extractCitationsFromOpenAI", () => {
		it("should extract citations from url_citation annotations", () => {
			const rawOutput = {
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								annotations: [
									{
										type: "url_citation",
										url: "https://example.com/article",
										title: "Example Article",
									},
								],
							},
						],
					},
				],
			};

			const citations = extractCitationsFromOpenAI(rawOutput);
			expect(citations).toHaveLength(1);
			expect(citations[0]).toEqual({
				url: "https://example.com/article",
				title: "Example Article",
				domain: "example.com",
			});
		});

		it("should extract domain without www prefix", () => {
			const rawOutput = {
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								annotations: [
									{
										type: "url_citation",
										url: "https://www.example.com/page",
									},
								],
							},
						],
					},
				],
			};

			const citations = extractCitationsFromOpenAI(rawOutput);
			expect(citations[0].domain).toBe("example.com");
		});

		it("should handle missing title", () => {
			const rawOutput = {
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								annotations: [
									{
										type: "url_citation",
										url: "https://example.com/page",
									},
								],
							},
						],
					},
				],
			};

			const citations = extractCitationsFromOpenAI(rawOutput);
			expect(citations[0].title).toBeUndefined();
		});

		it("should skip invalid URLs", () => {
			const rawOutput = {
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								annotations: [
									{ type: "url_citation", url: "not-a-valid-url" },
									{ type: "url_citation", url: "https://valid.com" },
								],
							},
						],
					},
				],
			};

			const citations = extractCitationsFromOpenAI(rawOutput);
			expect(citations).toHaveLength(1);
			expect(citations[0].domain).toBe("valid.com");
		});

		it("should handle empty output gracefully", () => {
			expect(extractCitationsFromOpenAI({})).toEqual([]);
			expect(extractCitationsFromOpenAI(null)).toEqual([]);
		});
	});

	describe("extractCitationsFromGoogle", () => {
		it("should extract citations from AI overview references", () => {
			const rawOutput = {
				tasks: [
					{
						result: [
							{
								items: [
									{
										type: "ai_overview",
										references: [
											{
												url: "https://example.com/source",
												title: "Source Article",
											},
										],
									},
								],
							},
						],
					},
				],
			};

			const citations = extractCitationsFromGoogle(rawOutput);
			expect(citations).toHaveLength(1);
			expect(citations[0]).toEqual({
				url: "https://example.com/source",
				title: "Source Article",
				domain: "example.com",
			});
		});

		it("should handle missing references gracefully", () => {
			const rawOutput = {
				tasks: [
					{
						result: [
							{
								items: [
									{ type: "ai_overview", markdown: "No refs" },
								],
							},
						],
					},
				],
			};

			expect(extractCitationsFromGoogle(rawOutput)).toEqual([]);
		});

		it("should handle empty output gracefully", () => {
			expect(extractCitationsFromGoogle({})).toEqual([]);
			expect(extractCitationsFromGoogle(null)).toEqual([]);
		});
	});

	describe("extractCitations", () => {
		it("should route to correct extractor based on model group", () => {
			const openaiOutput = {
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								annotations: [{ type: "url_citation", url: "https://openai-source.com" }],
							},
						],
					},
				],
			};

			const citations = extractCitations(openaiOutput, "openai");
			expect(citations).toHaveLength(1);
			expect(citations[0].domain).toBe("openai-source.com");
		});

		it("should return empty array for anthropic (no citations support)", () => {
			expect(extractCitations({}, "anthropic")).toEqual([]);
		});

		it("should return empty array for unknown model group", () => {
			expect(extractCitations({}, "unknown")).toEqual([]);
		});
	});
});
