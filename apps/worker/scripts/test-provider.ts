#!/usr/bin/env tsx
/**
 * Integration test for a scraping provider target.
 * Exercises the same code paths as the worker against real provider APIs.
 * Validates text content, citations, and rawOutput round-trip re-extraction.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online"
 *   pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online,gemini:olostep:online"
 */

import {
	parseScrapeTargets,
	getProvider,
	getModelMeta,
	type ScrapeResult,
} from "@workspace/lib/providers";
import { extractTextContent, extractCitations } from "@workspace/lib/text-extraction";
import { appendFileSync } from "node:fs";

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
Usage: pnpm tsx --env-file=.env scripts/test-provider.ts --target <scrape-targets>

  <scrape-targets>  Comma-separated SCRAPE_TARGETS entries, e.g. "chatgpt:olostep:online,gemini:olostep:online"

Examples:
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online"
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online,gemini:olostep:online"
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "claude:anthropic-api:claude-sonnet-4-20250514"
`);
			process.exit(0);
		}
	}
	console.error("Error: --target is required. Run with --help for usage.");
	process.exit(1);
}

const TEST_PROMPT = "What are the most popular brands of running shoes?";
const MIN_TEXT_LENGTH = 50;

interface ValidationIssue {
	field: string;
	message: string;
	severity: "error" | "warning";
}

function validateResult(result: ScrapeResult, providerId: string, webSearch: boolean): ValidationIssue[] {
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
			message: webSearch
				? "No citations returned (expected when online is enabled)"
				: "No citations returned (may be expected for some engines/prompts)",
			severity: webSearch ? "error" : "warning",
		});
	}

	if (webSearch && result.webQueries.length === 0) {
		issues.push({
			field: "webQueries",
			message: "No web queries returned (expected when online is enabled)",
			severity: "error",
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

async function runTarget(target: string): Promise<boolean> {
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
		const errorMsg = error instanceof Error ? error.message : String(error);
		log(`FAIL (${latency}ms)`, colors.red);
		log(`  Error: ${errorMsg}`, colors.red);
		if (process.env.GITHUB_STEP_SUMMARY) {
			appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
				`### :x: FAIL ${meta.label} via \`${providerId}\`${versionStr}`,
				"",
				`| Metric | Value |`,
				`|--------|-------|`,
				`| Target | \`${target}\` |`,
				`| Latency | ${latency}ms |`,
				`| Error | ${errorMsg.slice(0, 200)} |`,
				"",
			].join("\n"));
		}
		return false;
	}

	const latency = Date.now() - start;
	const issues = validateResult(result, providerId, config.webSearch);
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

	if (process.env.GITHUB_STEP_SUMMARY) {
		const status = hasErrors ? ":x: FAIL" : ":white_check_mark: PASS";
		const errors = issues.filter((i) => i.severity === "error");
		const warnings = issues.filter((i) => i.severity === "warning");
		const issueLines = [
			...errors.map((i) => `| :x: | \`${i.field}\` | ${i.message} |`),
			...warnings.map((i) => `| :warning: | \`${i.field}\` | ${i.message} |`),
		];

		const md = [
			`### ${status} ${meta.label} via \`${providerId}\`${versionStr}`,
			"",
			`| Metric | Value |`,
			`|--------|-------|`,
			`| Target | \`${target}\` |`,
			`| Latency | ${latency}ms |`,
			`| Text length | ${result.textContent?.length ?? 0} chars |`,
			`| Citations | ${result.citations.length} |`,
			`| Web queries | ${result.webQueries.length} |`,
			`| Web search | ${config.webSearch ? "enabled" : "disabled"} |`,
			"",
			...(issueLines.length > 0
				? [
					"| | Field | Issue |",
					"|--|-------|-------|",
					...issueLines,
					"",
				  ]
				: []),
			"<details><summary>Sample output</summary>",
			"",
			"```",
			result.textContent?.slice(0, 500) ?? "(empty)",
			"```",
			"</details>",
			"",
		].join("\n");

		appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
	}

	if (hasErrors) {
		log("FAIL", colors.red);
		return false;
	} else {
		log("PASS", colors.green);
		return true;
	}
}

async function main() {
	const targetArg = parseArgs();
	const targets = targetArg.split(",").map((t) => t.trim()).filter(Boolean);

	let passed = 0;
	let failed = 0;
	for (const target of targets) {
		const ok = await runTarget(target);
		if (ok) passed++;
		else failed++;
	}

	if (targets.length > 1) {
		log(`\n${"=".repeat(40)}`, colors.bright);
		log(`Results: ${passed} passed, ${failed} failed out of ${targets.length} targets`, failed > 0 ? colors.red : colors.green);
	}

	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
