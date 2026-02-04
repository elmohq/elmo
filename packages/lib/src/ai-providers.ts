/**
 * Shared AI provider functions for running prompts against OpenAI, Anthropic, and DataForSEO
 * Used by both the worker and test scripts to ensure consistent behavior
 */

import Anthropic from "@anthropic-ai/sdk";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import * as client from "dataforseo-client";
import { extractTextContent } from "./text-extraction";
import { dfsSerpApi } from "./dataforseo";
import { AI_MODELS } from "./constants";

// Initialize Anthropic client for direct API calls (for tool usage)
const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY!,
});

/**
 * Simple semaphore to limit concurrent API calls.
 *
 * This is used to prevent overwhelming external AI APIs when many workflows
 * wake up from sleep and try to make API calls simultaneously.
 *
 * This is safe to use inside DBOS steps because:
 * - The semaphore waiting happens INSIDE the step execution
 * - DBOS records step results - on replay, it uses recorded results without re-executing
 * - Step ordering is preserved (the step is still called in the same order)
 *
 * TODO(post-migration): Once initialDelayHours is removed and workerConcurrency
 * is reduced to 10-20, this semaphore can be removed or its limit increased,
 * since workerConcurrency will naturally limit concurrent API calls.
 */
class Semaphore {
	private permits: number;
	private waiting: Array<() => void> = [];

	constructor(permits: number) {
		this.permits = permits;
	}

	async acquire(): Promise<void> {
		if (this.permits > 0) {
			this.permits--;
			return;
		}
		return new Promise<void>((resolve) => {
			this.waiting.push(resolve);
		});
	}

	release(): void {
		const next = this.waiting.shift();
		if (next) {
			next();
		} else {
			this.permits++;
		}
	}

	async withPermit<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}
}

/**
 * Limits concurrent AI API calls to prevent overwhelming external services.
 * Set to 10 concurrent calls across all providers.
 */
const aiApiSemaphore = new Semaphore(10);

// Common result type for all providers
export interface PromptRunResult {
	rawOutput: any;
	webQueries: string[];
	textContent: string;
}

/**
 * Sanitize an object to ensure it's plain JSON-serializable.
 * This is critical for DBOS workflow serialization - API client libraries
 * often return class instances with methods that can't be serialized.
 */
function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Run prompt with OpenAI using Vercel AI SDK with web search
 */
export async function runWithOpenAI(promptValue: string): Promise<PromptRunResult> {
	return aiApiSemaphore.withPermit(async () => {
		let rawResponse: any = null;
		try {
			// Generate text with web search using OpenAI Responses API
			const result = await generateText({
				model: openai.responses(AI_MODELS.OPENAI.MODEL),
				prompt: promptValue,
				// if tool choice is required, it always just uses the input prompt instead of generating a relevant query
				toolChoice: "auto",
				tools: {
					web_search_preview: openai.tools.webSearchPreview({
						searchContextSize: "low",
					}) as any,
				},
			});

			// Capture raw response for debugging
			rawResponse = result.response?.body;

			// Extract web search queries from OpenAI Responses API output
			const webQueries: string[] = [];

			const responseBody = result.response?.body as any;
			if (responseBody?.output) {
				for (const outputItem of responseBody.output) {
					if (outputItem.type === "web_search_call" && outputItem.action?.query) {
						webQueries.push(outputItem.action.query);
					}
				}
			}

			return {
				rawOutput: sanitizeForJson(responseBody),
				webQueries,
				textContent: extractTextContent(responseBody, "openai"), // Extract text content for mention analysis
			};
		} catch (error: any) {
			console.error("Error running OpenAI prompt:", error);
			// Enhance error with more context including raw response
			let errorDetails = `OpenAI API error: ${error instanceof Error ? error.message : "Unknown error"}`;
			
			// Try to extract raw response from error object
			const errorResponse = error?.response || error?.data || error?.body || rawResponse;
			if (errorResponse) {
				try {
					errorDetails += `\nRaw response: ${JSON.stringify(errorResponse, null, 2)}`;
				} catch {
					errorDetails += `\nRaw response (non-JSON): ${String(errorResponse)}`;
				}
			}
			
			// Check for additional error properties
			if (error?.status) errorDetails += `\nStatus: ${error.status}`;
			if (error?.statusText) errorDetails += `\nStatus text: ${error.statusText}`;
			if (error?.cause) {
				try {
					errorDetails += `\nCause: ${JSON.stringify(error.cause, null, 2)}`;
				} catch {
					errorDetails += `\nCause: ${String(error.cause)}`;
				}
			}
			
			const enhancedError = new Error(errorDetails);
			if (error instanceof Error && error.stack) {
				enhancedError.stack = error.stack;
			}
			throw enhancedError;
		}
	});
}

/**
 * Run prompt with Anthropic
 */
export async function runWithAnthropic(promptValue: string): Promise<PromptRunResult> {
	return aiApiSemaphore.withPermit(async () => {
		let rawResponse: any = null;
		try {
			const response = await anthropic.messages.create({
				model: AI_MODELS.ANTHROPIC.MODEL,
				max_tokens: 4000,
				messages: [
					{
						role: "user",
						content: promptValue,
					},
				],
				// disabled web search for cost savings
				// tools: [
				// 	{
				// 		type: "web_search_20250305",
				// 		name: "web_search",
				// 		max_uses: 1,
				// 	},
				// ],
			});

			// Capture raw response for debugging
			rawResponse = response;

			// Extract text content from response using helper
			const textContent = extractTextContent(response, "anthropic");

			// Extract web search queries
			const webQueries = response.content
				.filter((block) => block.type === "server_tool_use" && block.name === "web_search")
				.map((block) => (block as any).input?.query)
				.filter(Boolean);

			return {
				rawOutput: sanitizeForJson(response),
				webQueries,
				textContent,
			};
		} catch (error: any) {
			console.error("Error running Anthropic prompt:", error);
			// Enhance error with more context including raw response
			let errorDetails = `Anthropic API error: ${error instanceof Error ? error.message : "Unknown error"}`;
			
			// Try to extract raw response from error object (Anthropic SDK includes this)
			const errorResponse = error?.response || error?.body || error?.error || rawResponse;
			if (errorResponse) {
				try {
					errorDetails += `\nRaw response: ${JSON.stringify(errorResponse, null, 2)}`;
				} catch {
					errorDetails += `\nRaw response (non-JSON): ${String(errorResponse)}`;
				}
			}
			
			// Check for additional error properties
			if (error?.status) errorDetails += `\nStatus: ${error.status}`;
			if (error?.headers) {
				try {
					errorDetails += `\nHeaders: ${JSON.stringify(Object.fromEntries(error.headers), null, 2)}`;
				} catch {
					// headers might not be iterable
				}
			}
			
			const enhancedError = new Error(errorDetails);
			if (error instanceof Error && error.stack) {
				enhancedError.stack = error.stack;
			}
			throw enhancedError;
		}
	});
}

/**
 * Run prompt with DataForSEO (Google AI Mode)
 */
export async function runWithDataForSEO(promptValue: string): Promise<PromptRunResult> {
	return aiApiSemaphore.withPermit(async () => {
		let rawResponse: any = null;
		try {
			// Use DataForSEO AI Mode Live Advanced endpoint to get AI-powered search results
			const requestInfo = new client.SerpGoogleAiModeLiveAdvancedRequestInfo({
				keyword: promptValue,
				location_code: 2840, // United States
				language_code: "en",
				depth: 10,
			});

			const response = await dfsSerpApi.googleAiModeLiveAdvanced([requestInfo]);
			
			// Capture raw response for debugging
			rawResponse = response;

			if (!response || !response.tasks || response.tasks.length === 0) {
				throw new Error(`DataForSEO API Error: No response or tasks. Raw response: ${JSON.stringify(response, null, 2)}`);
			}

			const task = response.tasks[0];
			if (task.status_code !== 20000 || !task.result || task.result.length === 0) {
				throw new Error(`DataForSEO API Error: ${task.status_message}. Task details: ${JSON.stringify(task, null, 2)}`);
			}

			const textContent = extractTextContent(response, "google");

			// There aren't separate web queries for Google AI Mode
			const webQueries = [promptValue];

			return {
				rawOutput: sanitizeForJson(response),
				webQueries,
				textContent,
			};
		} catch (error: any) {
			console.error("Error running DataForSEO search:", error);
			// Enhance error with more context including raw response
			let errorDetails = `DataForSEO API error: ${error instanceof Error ? error.message : "Unknown error"}`;
			
			// Include raw response if we have it and it's not already in the error message
			if (rawResponse && !errorDetails.includes("Raw response")) {
				try {
					errorDetails += `\nRaw response: ${JSON.stringify(rawResponse, null, 2)}`;
				} catch {
					errorDetails += `\nRaw response (non-JSON): ${String(rawResponse)}`;
				}
			}
			
			// Check for additional error properties
			if (error?.status) errorDetails += `\nStatus: ${error.status}`;
			if (error?.response) {
				try {
					errorDetails += `\nError response: ${JSON.stringify(error.response, null, 2)}`;
				} catch {
					errorDetails += `\nError response: ${String(error.response)}`;
				}
			}
			
			const enhancedError = new Error(errorDetails);
			if (error instanceof Error && error.stack) {
				enhancedError.stack = error.stack;
			}
			throw enhancedError;
		}
	});
}

