#!/usr/bin/env tsx
/**
 * Test script to run a prompt against OpenAI, Anthropic, and DataForSEO (Google AI Mode)
 * Uses the exact same code paths as the worker for consistency.
 * 
 * Usage:
 *   pnpm tsx --env-file=.env scripts/test-prompt.ts "Your prompt here"
 *   
 * Or with specific provider(s):
 *   pnpm tsx --env-file=.env scripts/test-prompt.ts "Your prompt" --provider openai
 *   pnpm tsx --env-file=.env scripts/test-prompt.ts "Your prompt" --provider anthropic
 *   pnpm tsx --env-file=.env scripts/test-prompt.ts "Your prompt" --provider google
 */

import { runWithOpenAI, runWithAnthropic, runWithDataForSEO, type PromptRunResult } from "../src/lib/ai-providers";
import { extractCitations } from "../src/lib/text-extraction";
import { AI_MODELS } from "../src/lib/constants";

// Colors for terminal output
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
};

function log(message: string, color?: string) {
	console.log(`${color || ""}${message}${colors.reset}`);
}

function logSection(title: string) {
	console.log("\n" + "=".repeat(80));
	log(title, colors.bright + colors.cyan);
	console.log("=".repeat(80));
}

function logSubSection(title: string) {
	console.log("\n" + "-".repeat(60));
	log(title, colors.yellow);
	console.log("-".repeat(60));
}

// Display results
function displayResults(
	provider: string,
	result: PromptRunResult,
	durationMs: number,
	showRaw: boolean
) {
	if (showRaw) {
		logSubSection("Raw Output");
		console.log(JSON.stringify(result.rawOutput, null, 2));
	}

	logSubSection(`Web Queries (${result.webQueries.length})`);
	if (result.webQueries.length > 0) {
		result.webQueries.forEach((q, i) => {
			log(`  ${i + 1}. ${q}`, colors.dim);
		});
	} else {
		log("  (none)", colors.dim);
	}

	logSubSection("Text Content");
	console.log(result.textContent);

	// Extract citations if available
	const citations = extractCitations(result.rawOutput, provider);
	if (citations.length > 0) {
		logSubSection(`Citations (${citations.length})`);
		citations.forEach((c, i) => {
			log(`  ${i + 1}. ${c.domain}`, colors.blue);
			if (c.title) log(`     Title: ${c.title}`, colors.dim);
			log(`     URL: ${c.url}`, colors.dim);
		});
	}

	logSubSection("Metadata");
	log(`  Duration: ${durationMs}ms`, colors.green);
	log(`  Model: ${provider === "openai" ? AI_MODELS.OPENAI.MODEL : provider === "anthropic" ? AI_MODELS.ANTHROPIC.MODEL : "dataforseo"}`, colors.dim);
}

// Main function
async function main() {
	const args = process.argv.slice(2);
	
	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		console.log(`
Usage: pnpm tsx --env-file=.env scripts/test-prompt.ts "Your prompt here" [options]

Options:
  --provider <name>   Run only specific provider (openai, anthropic, google)
  --raw               Output raw JSON response
  --help, -h          Show this help

Examples:
  pnpm tsx --env-file=.env scripts/test-prompt.ts "What are the best vitamins for energy?"
  pnpm tsx --env-file=.env scripts/test-prompt.ts "Best laptop 2024" --provider openai
  pnpm tsx --env-file=.env scripts/test-prompt.ts "Climate change effects" --raw
`);
		process.exit(0);
	}

	// Parse arguments
	let prompt = "";
	let specificProvider: string | null = null;
	let showRaw = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--provider" && args[i + 1]) {
			specificProvider = args[i + 1].toLowerCase();
			i++;
		} else if (args[i] === "--raw") {
			showRaw = true;
		} else if (!args[i].startsWith("--")) {
			prompt = args[i];
		}
	}

	if (!prompt) {
		log("Error: No prompt provided", colors.red);
		process.exit(1);
	}

	log("\n📝 Testing prompt:", colors.bright);
	log(`   "${prompt}"`, colors.cyan);

	const providers = specificProvider 
		? [specificProvider] 
		: ["openai", "anthropic", "google"];

	for (const provider of providers) {
		logSection(`${provider.toUpperCase()} ${provider === "openai" ? "(with web search)" : provider === "google" ? "(DataForSEO AI Mode)" : "(no web search)"}`);

		try {
			const startTime = Date.now();
			let result: PromptRunResult;

			switch (provider) {
				case "openai":
					result = await runWithOpenAI(prompt);
					break;
				case "anthropic":
					result = await runWithAnthropic(prompt);
					break;
				case "google":
					result = await runWithDataForSEO(prompt);
					break;
				default:
					log(`Unknown provider: ${provider}`, colors.red);
					continue;
			}

			const durationMs = Date.now() - startTime;
			displayResults(provider, result, durationMs, showRaw);

			log(`\n✅ ${provider.toUpperCase()} completed successfully`, colors.green);
		} catch (error) {
			log(`\n❌ ${provider.toUpperCase()} failed:`, colors.red);
			console.error(error instanceof Error ? error.message : error);
		}
	}

	console.log("\n" + "=".repeat(80));
	log("Test complete!", colors.bright + colors.green);
	console.log("=".repeat(80) + "\n");
}

main().catch(console.error);
