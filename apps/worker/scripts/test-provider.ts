#!/usr/bin/env tsx
/**
 * Integration test for scraping provider targets.
 * Exercises the same code paths as the worker against real provider APIs.
 * Validates text content, citations, and rawOutput round-trip re-extraction.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online"
 *   pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online,gemini:olostep:online"
 *   pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online" --output-json result.json
 */

import {
	parseScrapeTargets,
	getProvider,
	getModelMeta,
	type ScrapeResult,
} from "@workspace/lib/providers";
import { extractTextContent, extractCitations } from "@workspace/lib/text-extraction";
import { appendFileSync, writeFileSync } from "node:fs";

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

interface ParsedArgs {
	target: string;
	outputJson?: string;
}

function parseArgs(): ParsedArgs {
	const argv = process.argv.slice(2);
	let target: string | undefined;
	let outputJson: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--target" && argv[i + 1]) { target = argv[++i]; continue; }
		if (argv[i] === "--output-json" && argv[i + 1]) { outputJson = argv[++i]; continue; }
		if (argv[i] === "--help" || argv[i] === "-h") {
			console.log(`
Usage: pnpm tsx --env-file=.env scripts/test-provider.ts --target <scrape-targets> [--output-json <path>]

  <scrape-targets>  Comma-separated SCRAPE_TARGETS entries, e.g. "chatgpt:olostep:online,gemini:olostep:online"
  --output-json     Write results as JSON to the given path (for CI artifact collection)

Examples:
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online"
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online,gemini:olostep:online"
  pnpm tsx --env-file=.env scripts/test-provider.ts --target "chatgpt:olostep:online" --output-json result.json
`);
			process.exit(0);
		}
	}
	if (!target) {
		console.error("Error: --target is required. Run with --help for usage.");
		process.exit(1);
	}
	return { target, outputJson };
}

const TEST_PROMPT = "What are the most popular brands of running shoes?";
const MIN_TEXT_LENGTH = 50;

interface ValidationIssue {
	field: string;
	message: string;
	severity: "error" | "warning";
}

export interface TargetResult {
	target: string;
	status: "pass" | "fail";
	latency: number;
	error?: string;
	textLength: number;
	citations: number;
	webQueries: number;
	webSearch: boolean;
	sampleOutput: string;
	issues: ValidationIssue[];
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

async function runTarget(target: string): Promise<TargetResult> {
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
		return {
			target,
			status: "fail",
			latency,
			error: errorMsg,
			textLength: 0,
			citations: 0,
			webQueries: 0,
			webSearch: config.webSearch,
			sampleOutput: "",
			issues: [],
		};
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

	if (hasErrors) {
		log("FAIL", colors.red);
	} else {
		log("PASS", colors.green);
	}

	return {
		target,
		status: hasErrors ? "fail" : "pass",
		latency,
		textLength: result.textContent?.length ?? 0,
		citations: result.citations.length,
		webQueries: result.webQueries.length,
		webSearch: config.webSearch,
		sampleOutput: result.textContent?.slice(0, 500) ?? "",
		issues,
	};
}

function writeGitHubSummary(results: TargetResult[]) {
	if (!process.env.GITHUB_STEP_SUMMARY) return;

	const passed = results.filter((r) => r.status === "pass").length;
	const failed = results.filter((r) => r.status === "fail").length;
	const total = results.length;
	const overallStatus = failed > 0 ? `:x: ${failed} failed` : `:white_check_mark: All passed`;

	const lines: string[] = [
		`## Provider Test Results — ${overallStatus} (${passed}/${total})`,
		"",
		"| Status | Target | Latency | Error | Text Length | Citations | Web Queries | Web Search | Sample Output |",
		"|--------|--------|---------|-------|-------------|-----------|-------------|------------|---------------|",
	];

	for (const r of results) {
		const status = r.status === "pass" ? ":white_check_mark:" : ":x:";
		const error = r.error ? r.error.slice(0, 100).replace(/\|/g, "\\|") : "";
		const sample = r.sampleOutput
			? `<details><summary>Show</summary><pre>${r.sampleOutput.replace(/\|/g, "\\|").replace(/\n/g, "<br>")}</pre></details>`
			: "";
		lines.push(
			`| ${status} | \`${r.target}\` | ${r.latency}ms | ${error} | ${r.textLength} | ${r.citations} | ${r.webQueries} | ${r.webSearch ? "enabled" : "disabled"} | ${sample} |`,
		);
	}

	const allIssues = results.flatMap((r) =>
		r.issues.map((i) => ({ target: r.target, ...i })),
	);

	if (allIssues.length > 0) {
		lines.push("", "### Validation Issues", "");
		lines.push("| Severity | Target | Field | Issue |");
		lines.push("|----------|--------|-------|-------|");
		for (const i of allIssues) {
			const icon = i.severity === "error" ? ":x:" : ":warning:";
			lines.push(`| ${icon} | \`${i.target}\` | \`${i.field}\` | ${i.message} |`);
		}
	}

	lines.push("");
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}

async function main() {
	const { target: targetArg, outputJson } = parseArgs();
	const targets = targetArg.split(",").map((t) => t.trim()).filter(Boolean);

	const results: TargetResult[] = [];
	for (const target of targets) {
		results.push(await runTarget(target));
	}

	const passed = results.filter((r) => r.status === "pass").length;
	const failed = results.filter((r) => r.status === "fail").length;

	if (targets.length > 1) {
		log(`\n${"=".repeat(40)}`, colors.bright);
		log(`Results: ${passed} passed, ${failed} failed out of ${targets.length} targets`, failed > 0 ? colors.red : colors.green);
	}

	if (outputJson) {
		writeFileSync(outputJson, JSON.stringify(results, null, 2));
	} else {
		writeGitHubSummary(results);
	}

	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
