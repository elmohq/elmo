#!/usr/bin/env tsx
/**
 * Integration test for a scraping provider target.
 * Exercises the same code paths as the worker against real provider APIs.
 * Validates text content, citations, and rawOutput round-trip re-extraction.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online"
 */

import {
	parseScrapeTargets,
	getProvider,
	getModelMeta,
	type ScrapeResult,
} from "@workspace/lib/providers";
import { extractTextContent, extractCitations } from "@workspace/lib/text-extraction";

const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
};

function log(message: string, color?: string) {
	console.log(`${color || ""}${message}${colors.reset}`);
}

function parseArgs(): string {
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--target" && argv[i + 1]) return argv[i + 1];
		if (argv[i] === "--help" || argv[i] === "-h") {
			console.log(`
Usage: pnpm tsx --env-file=.env scripts/test-provider.ts --target <scrape-target>

  <scrape-target>  A SCRAPE_TARGETS entry, e.g. "chatgpt:olostep:online"

Examples:
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online"
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "google-ai-mode:dataforseo"
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "claude:anthropic-api:claude-sonnet-4-20250514"
`);
			process.exit(0);
		}
	}
	console.error("Error: --target is required. Run with --help for usage.");
	process.exit(1);
}

const TEST_PROMPT = "What are the best running shoes?";
const MIN_TEXT_LENGTH = 50;

interface ValidationIssue {
	field: string;
	message: string;
	severity: "error" | "warning";
}

function validateResult(result: ScrapeResult, providerId: string): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (!result.textContent || result.textContent.length < MIN_TEXT_LENGTH) {
		issues.push({
			field: "textContent",
			message: `Text too short (${result.textContent?.length ?? 0} chars, need ${MIN_TEXT_LENGTH}+)`,
			severity: "error",
		});
	}

	if (result.textContent?.startsWith("No text content") || result.textContent?.startsWith("Error extracting")) {
		issues.push({
			field: "textContent",
			message: `Extraction returned placeholder: "${result.textContent.slice(0, 60)}"`,
			severity: "error",
		});
	}

	if (result.rawOutput == null) {
		issues.push({ field: "rawOutput", message: "rawOutput is null", severity: "error" });
	}

	if (result.rawOutput != null) {
		const reExtracted = extractTextContent(result.rawOutput, providerId);
		if (reExtracted.startsWith("No text content") || reExtracted.startsWith("Unknown") || reExtracted.startsWith("Error")) {
			issues.push({
				field: "rawOutput re-extraction",
				message: `extractTextContent(rawOutput, "${providerId}") returned: "${reExtracted.slice(0, 80)}"`,
				severity: "error",
			});
		}

		const reExtractedCitations = extractCitations(result.rawOutput, providerId);
		if (result.citations.length > 0 && reExtractedCitations.length === 0) {
			issues.push({
				field: "rawOutput citation re-extraction",
				message: `Provider returned ${result.citations.length} citations but extractCitations(rawOutput, "${providerId}") found 0`,
				severity: "warning",
			});
		}
	}

	if (result.citations.length === 0) {
		issues.push({
			field: "citations",
			message: "No citations returned (may be expected for some engines/prompts)",
			severity: "warning",
		});
	}

	for (const [i, cit] of result.citations.entries()) {
		if (!cit.url || !cit.url.startsWith("http")) {
			issues.push({ field: `citations[${i}].url`, message: `Invalid URL: "${cit.url}"`, severity: "error" });
		}
		if (!cit.domain) {
			issues.push({ field: `citations[${i}].domain`, message: "Missing domain", severity: "error" });
		}
	}

	return issues;
}

async function main() {
	const target = parseArgs();
	const [config] = parseScrapeTargets(target);
	const providerId = config.provider;
	const provider = getProvider(providerId);
	const meta = getModelMeta(config.model);
	const versionStr = config.version ? ` (${config.version})` : "";

	log(`\nTesting: ${meta.label} via ${providerId}${versionStr}`, colors.bright);
	log(`Web search: ${config.webSearch ? "enabled" : "disabled"}`, colors.dim);
	log(`Test prompt: "${TEST_PROMPT}"`, colors.dim);
	log(`Validating: text content (${MIN_TEXT_LENGTH}+ chars), citations, rawOutput re-extraction\n`, colors.dim);

	const start = Date.now();
	let result: ScrapeResult;
	try {
		result = await provider.run(config.model, TEST_PROMPT, {
			webSearch: config.webSearch,
			version: config.version,
		});
	} catch (error) {
		const latency = Date.now() - start;
		log(`FAIL (${latency}ms)`, colors.red);
		log(`  Error: ${error instanceof Error ? error.message : String(error)}`, colors.red);
		process.exit(1);
	}

	const latency = Date.now() - start;
	const issues = validateResult(result, providerId);
	const hasErrors = issues.some((i) => i.severity === "error");

	log(`Latency:    ${latency}ms`, colors.dim);
	log(`Text:       ${result.textContent?.length ?? 0} chars`, colors.dim);
	log(`Citations:  ${result.citations.length}`, colors.blue);
	log(`Web queries: ${result.webQueries.length}`, colors.dim);

	if (result.textContent) {
		log("\nSample output:", colors.dim);
		log(`  ${result.textContent.slice(0, 300).replace(/\n/g, "\n  ")}`, colors.dim);
	}

	if (issues.length > 0) {
		log("\nIssues:", colors.bright);
		for (const issue of issues) {
			const color = issue.severity === "error" ? colors.red : colors.yellow;
			const prefix = issue.severity === "error" ? "ERROR" : "WARN";
			log(`  ${prefix}: [${issue.field}] ${issue.message}`, color);
		}
	}

	console.log();
	if (hasErrors) {
		log("FAIL", colors.red);
		process.exit(1);
	} else {
		log("PASS", colors.green);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
