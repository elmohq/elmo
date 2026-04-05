#!/usr/bin/env tsx
/**
 * Integration test script for scraping providers.
 * Exercises the same code paths as the worker, against real provider APIs.
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
	type TestResult,
	type ScrapeResult,
} from "@workspace/lib/providers";

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

interface RunResult {
	engine: string;
	provider: string;
	model: string | undefined;
	success: boolean;
	latencyMs: number;
	error?: string;
	citationCount?: number;
	sampleOutput?: string;
}

async function runPing(config: EngineConfig): Promise<RunResult> {
	const providerId = resolveProviderId(config.provider, config.engine);
	const provider = getProvider(providerId);
	const result: TestResult = await provider.testConnection(config.engine);
	return {
		engine: config.engine,
		provider: providerId,
		model: config.model,
		success: result.success,
		latencyMs: result.latencyMs,
		error: result.error,
		sampleOutput: result.sampleOutput,
	};
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
		return {
			engine: config.engine,
			provider: providerId,
			model: config.model,
			success: true,
			latencyMs,
			citationCount: result.citations.length,
			sampleOutput: result.textContent.slice(0, 200),
		};
	} catch (error) {
		return {
			engine: config.engine,
			provider: providerId,
			model: config.model,
			success: false,
			latencyMs: Date.now() - start,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function printResult(r: RunResult, ping: boolean) {
	const meta = getEngineMeta(r.engine);
	const status = r.success
		? `${colors.green}PASS${colors.reset}`
		: `${colors.red}FAIL${colors.reset}`;
	const modelStr = r.model ? ` (${r.model})` : "";

	logSection(`${meta.label} via ${r.provider}${modelStr}`);
	log(`  Status:  ${status}`);
	log(`  Latency: ${r.latencyMs}ms`, colors.dim);

	if (r.error) {
		log(`  Error:   ${r.error}`, colors.red);
	}
	if (r.sampleOutput) {
		log("  Sample:", colors.dim);
		log(`    ${r.sampleOutput.replace(/\n/g, "\n    ")}`, colors.dim);
	}
	if (!ping && r.citationCount !== undefined) {
		log(`  Citations: ${r.citationCount}`, colors.blue);
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
	const citCol = 10;

	const header = ping
		? `${"Engine".padEnd(engineCol)}${"Provider".padEnd(providerCol)}${"Model".padEnd(modelCol)}${"Status".padEnd(statusCol)}${"Latency".padEnd(latencyCol)}`
		: `${"Engine".padEnd(engineCol)}${"Provider".padEnd(providerCol)}${"Model".padEnd(modelCol)}${"Status".padEnd(statusCol)}${"Latency".padEnd(latencyCol)}${"Citations".padEnd(citCol)}`;

	log(header, colors.bright);
	console.log("-".repeat(header.length));

	for (const r of results) {
		const status = r.success ? "PASS" : "FAIL";
		const statusColor = r.success ? colors.green : colors.red;
		const model = r.model ?? "-";
		const latency = `${r.latencyMs}ms`;
		const citations = r.citationCount !== undefined ? String(r.citationCount) : "-";

		const line = ping
			? `${r.engine.padEnd(engineCol)}${r.provider.padEnd(providerCol)}${model.padEnd(modelCol)}${statusColor}${status.padEnd(statusCol)}${colors.reset}${latency.padEnd(latencyCol)}`
			: `${r.engine.padEnd(engineCol)}${r.provider.padEnd(providerCol)}${model.padEnd(modelCol)}${statusColor}${status.padEnd(statusCol)}${colors.reset}${latency.padEnd(latencyCol)}${citations.padEnd(citCol)}`;

		console.log(line);
	}

	const passed = results.filter((r) => r.success).length;
	const total = results.length;
	const allPassed = passed === total;

	console.log("-".repeat(header.length));
	log(
		`${passed}/${total} passed`,
		allPassed ? colors.green : colors.red,
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
