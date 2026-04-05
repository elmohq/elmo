#!/usr/bin/env tsx
/**
 * Integration test script for scraping providers.
 * Exercises the same code paths as the worker, against real provider APIs.
 * Validates that each provider returns meaningful text content and citations,
 * and that the rawOutput can be re-extracted correctly.
 *
 * Usage:
 *   pnpm tsx --env-file=.env scripts/test-providers.ts                       # Test all engines
 *   pnpm tsx --env-file=.env scripts/test-providers.ts --engine chatgpt     # Test specific engine
 *   pnpm tsx --env-file=.env scripts/test-providers.ts --provider olostep   # Test specific provider
 *   pnpm tsx --env-file=.env scripts/test-providers.ts --ping               # Quick auth check only
 */

import {
	parseScrapeTargets,
	getProvider,
	resolveProviderId,
	getEngineMeta,
	type EngineConfig,
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

function logSection(title: string) {
	console.log("\n" + "=".repeat(80));
	log(title, colors.bright + colors.cyan);
	console.log("=".repeat(80));
}

interface Args {
	engine: string | null;
	provider: string | null;
	ping: boolean;
}

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	const result: Args = { engine: null, provider: null, ping: false };
	for (let i = 0; i < argv.length; i++) {
		switch (argv[i]) {
			case "--engine":
				result.engine = argv[++i] ?? null;
				break;
			case "--provider":
				result.provider = argv[++i] ?? null;
				break;
			case "--ping":
				result.ping = true;
				break;
			case "--help":
			case "-h":
				console.log(`
Usage: pnpm tsx --env-file=.env scripts/test-providers.ts [options]

Options:
  --engine <name>     Test only configs matching this engine (e.g. chatgpt)
  --provider <name>   Test only configs matching this provider (e.g. olostep)
  --ping              Quick auth/connectivity check instead of full test
  --help, -h          Show this help
`);
				process.exit(0);
		}
	}
	return result;
}

const TEST_PROMPT = "What are the best running shoes?";
const MIN_TEXT_LENGTH = 50;

interface ValidationIssue {
	field: string;
	message: string;
	severity: "error" | "warning";
}

interface RunResult {
	engine: string;
	provider: string;
	model: string | undefined;
	success: boolean;
	latencyMs: number;
	error?: string;
	textLength?: number;
	citationCount?: number;
	sampleOutput?: string;
	issues: ValidationIssue[];
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

	// Validate that rawOutput can be re-extracted using text-extraction.ts
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

async function runFull(config: EngineConfig): Promise<RunResult> {
	const providerId = resolveProviderId(config.provider, config.engine);
	const provider = getProvider(providerId);
	const start = Date.now();
	try {
		const result: ScrapeResult = await provider.run(config.engine, TEST_PROMPT, {
			webSearch: config.webSearch,
			model: config.model,
		});
		const latencyMs = Date.now() - start;
		const issues = validateResult(result, providerId);
		const hasErrors = issues.some((i) => i.severity === "error");

		return {
			engine: config.engine,
			provider: providerId,
			model: config.model,
			success: !hasErrors,
			latencyMs,
			textLength: result.textContent?.length ?? 0,
			citationCount: result.citations.length,
			sampleOutput: result.textContent?.slice(0, 200),
			issues,
		};
	} catch (error) {
		return {
			engine: config.engine,
			provider: providerId,
			model: config.model,
			success: false,
			latencyMs: Date.now() - start,
			error: error instanceof Error ? error.message : String(error),
			issues: [{ field: "run", message: String(error), severity: "error" }],
		};
	}
}

async function runPing(config: EngineConfig): Promise<RunResult> {
	const providerId = resolveProviderId(config.provider, config.engine);
	const provider = getProvider(providerId);
	const start = Date.now();
	try {
		const result = await provider.run(config.engine, "What is 2+2?", {
			webSearch: false,
			model: config.model,
		});
		const latencyMs = Date.now() - start;
		const ok = !!result.textContent && result.textContent.length > 5;
		return {
			engine: config.engine,
			provider: providerId,
			model: config.model,
			success: ok,
			latencyMs,
			sampleOutput: result.textContent?.slice(0, 100),
			issues: ok ? [] : [{ field: "textContent", message: "Empty or too short response", severity: "error" }],
		};
	} catch (error) {
		return {
			engine: config.engine,
			provider: providerId,
			model: config.model,
			success: false,
			latencyMs: Date.now() - start,
			error: error instanceof Error ? error.message : String(error),
			issues: [{ field: "ping", message: String(error), severity: "error" }],
		};
	}
}

function printResult(r: RunResult, ping: boolean) {
	const meta = getEngineMeta(r.engine);
	const status = r.success ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
	const modelStr = r.model ? ` (${r.model})` : "";

	logSection(`${meta.label} via ${r.provider}${modelStr}`);
	log(`  Status:   ${status}`);
	log(`  Latency:  ${r.latencyMs}ms`, colors.dim);

	if (r.error) {
		log(`  Error:    ${r.error}`, colors.red);
	}
	if (r.textLength !== undefined) {
		log(`  Text:     ${r.textLength} chars`, colors.dim);
	}
	if (r.sampleOutput) {
		log("  Sample:", colors.dim);
		log(`    ${r.sampleOutput.replace(/\n/g, "\n    ")}`, colors.dim);
	}
	if (!ping && r.citationCount !== undefined) {
		log(`  Citations: ${r.citationCount}`, colors.blue);
	}

	for (const issue of r.issues) {
		const color = issue.severity === "error" ? colors.red : colors.yellow;
		const prefix = issue.severity === "error" ? "ERROR" : "WARN";
		log(`  ${prefix}: [${issue.field}] ${issue.message}`, color);
	}
}

function printSummary(results: RunResult[], ping: boolean) {
	console.log("\n" + "=".repeat(80));
	log("SUMMARY", colors.bright + colors.cyan);
	console.log("=".repeat(80));

	const engineCol = 20;
	const providerCol = 18;
	const modelCol = 22;
	const statusCol = 8;
	const latencyCol = 10;
	const textCol = 10;
	const citCol = 10;
	const issueCol = 8;

	const header = ping
		? `${"Engine".padEnd(engineCol)}${"Provider".padEnd(providerCol)}${"Model".padEnd(modelCol)}${"Status".padEnd(statusCol)}${"Latency".padEnd(latencyCol)}`
		: `${"Engine".padEnd(engineCol)}${"Provider".padEnd(providerCol)}${"Model".padEnd(modelCol)}${"Status".padEnd(statusCol)}${"Latency".padEnd(latencyCol)}${"Text".padEnd(textCol)}${"Cites".padEnd(citCol)}${"Issues".padEnd(issueCol)}`;

	log(header, colors.bright);
	console.log("-".repeat(header.length));

	for (const r of results) {
		const status = r.success ? "PASS" : "FAIL";
		const statusColor = r.success ? colors.green : colors.red;
		const model = (r.model ?? "-").slice(0, modelCol - 2);
		const latency = `${r.latencyMs}ms`;
		const text = r.textLength !== undefined ? `${r.textLength}ch` : "-";
		const citations = r.citationCount !== undefined ? String(r.citationCount) : "-";
		const errorCount = r.issues.filter((i) => i.severity === "error").length;
		const warnCount = r.issues.filter((i) => i.severity === "warning").length;
		const issueStr = errorCount > 0 ? `${errorCount}E` : warnCount > 0 ? `${warnCount}W` : "0";

		const line = ping
			? `${r.engine.padEnd(engineCol)}${r.provider.padEnd(providerCol)}${model.padEnd(modelCol)}${statusColor}${status.padEnd(statusCol)}${colors.reset}${latency.padEnd(latencyCol)}`
			: `${r.engine.padEnd(engineCol)}${r.provider.padEnd(providerCol)}${model.padEnd(modelCol)}${statusColor}${status.padEnd(statusCol)}${colors.reset}${latency.padEnd(latencyCol)}${text.padEnd(textCol)}${citations.padEnd(citCol)}${issueStr.padEnd(issueCol)}`;

		console.log(line);
	}

	const passed = results.filter((r) => r.success).length;
	const total = results.length;
	const totalErrors = results.reduce((sum, r) => sum + r.issues.filter((i) => i.severity === "error").length, 0);
	const totalWarnings = results.reduce((sum, r) => sum + r.issues.filter((i) => i.severity === "warning").length, 0);

	console.log("-".repeat(header.length));
	log(
		`${passed}/${total} passed` +
			(totalErrors > 0 ? `, ${totalErrors} error(s)` : "") +
			(totalWarnings > 0 ? `, ${totalWarnings} warning(s)` : ""),
		passed === total ? colors.green : colors.red,
	);
	console.log();
}

async function main() {
	const args = parseArgs();
	const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

	const filtered = configs.filter((c) => {
		if (args.engine && c.engine !== args.engine) return false;
		const resolved = resolveProviderId(c.provider, c.engine);
		if (args.provider && resolved !== args.provider && c.provider !== args.provider) return false;
		return true;
	});

	if (filtered.length === 0) {
		log("No matching engine/provider configs found after filtering.", colors.yellow);
		process.exit(1);
	}

	const mode = args.ping ? "PING" : "FULL";
	log(`\nRunning ${mode} tests against ${filtered.length} config(s)...`, colors.bright);
	if (!args.ping) {
		log(`Test prompt: "${TEST_PROMPT}"`, colors.dim);
		log(`Validating: text content (${MIN_TEXT_LENGTH}+ chars), citations, rawOutput re-extraction`, colors.dim);
	}

	const results: RunResult[] = [];
	for (const config of filtered) {
		const result = args.ping ? await runPing(config) : await runFull(config);
		printResult(result, args.ping);
		results.push(result);
	}

	printSummary(results, args.ping);

	const failed = results.filter((r) => !r.success);
	if (failed.length > 0) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
