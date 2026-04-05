/**
 * Thin facade over the new provider modules.
 *
 * Preserves the original exported function signatures (`runWithOpenAI`,
 * `runWithAnthropic`, `runWithDataForSEO`) so existing call sites
 * (worker, test-prompt.ts, report-worker.ts) continue to work.
 *
 * New code should import from `@workspace/lib/providers` directly.
 */

import { directOpenai } from "./providers/direct-openai";
import { directAnthropic } from "./providers/direct-anthropic";
import { dataforseo } from "./providers/dataforseo";

export interface PromptRunResult {
	rawOutput: any;
	webQueries: string[];
	textContent: string;
}

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

export const aiApiSemaphore = new Semaphore(10);

export async function runWithOpenAI(promptValue: string): Promise<PromptRunResult> {
	return aiApiSemaphore.withPermit(async () => {
		const result = await directOpenai.run("chatgpt", promptValue, { webSearch: true });
		return {
			rawOutput: result.rawOutput,
			webQueries: result.webQueries,
			textContent: result.textContent,
		};
	});
}

export async function runWithAnthropic(promptValue: string): Promise<PromptRunResult> {
	return aiApiSemaphore.withPermit(async () => {
		const result = await directAnthropic.run("claude", promptValue, { webSearch: false });
		return {
			rawOutput: result.rawOutput,
			webQueries: result.webQueries,
			textContent: result.textContent,
		};
	});
}

export async function runWithDataForSEO(promptValue: string): Promise<PromptRunResult> {
	return aiApiSemaphore.withPermit(async () => {
		const result = await dataforseo.run("google-ai-mode", promptValue);
		return {
			rawOutput: result.rawOutput,
			webQueries: result.webQueries,
			textContent: result.textContent,
		};
	});
}
