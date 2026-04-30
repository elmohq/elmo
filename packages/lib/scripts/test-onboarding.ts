#!/usr/bin/env tsx
/**
 * Quick CLI to exercise the onboarding pipeline end-to-end against whichever
 * direct API provider is configured in your environment. Useful for trying a
 * new prompt, comparing providers, or sanity-checking that web search is
 * working.
 *
 * Usage:
 *   tsx packages/lib/scripts/test-onboarding.ts <website> [brandName]
 *
 *   # or, from the repo root with apps/web/.env loaded:
 *   pnpm --filter @workspace/lib test:onboarding nike.com
 *
 * Reads `apps/web/.env` automatically if present (so you don't have to copy
 * keys around), but real env vars take precedence. Honors
 * `ONBOARDING_LLM_TARGET` if you want to force a specific provider/model.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzeBrand } from "../src/onboarding";
import { resolveResearchTarget } from "../src/onboarding/llm";

async function loadDotEnv(path: string): Promise<void> {
	let contents: string;
	try {
		contents = await readFile(path, "utf8");
	} catch {
		return;
	}
	for (const line of contents.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq < 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		// Real env wins — don't clobber existing values.
		if (process.env[key] === undefined) process.env[key] = value;
	}
}

async function main() {
	const [website, brandName] = process.argv.slice(2);
	if (!website) {
		console.error("Usage: tsx test-onboarding.ts <website> [brandName]");
		console.error("Example: tsx test-onboarding.ts nike.com");
		process.exit(1);
	}

	// Try common .env locations relative to the repo root (this script lives
	// at packages/lib/scripts/, so the repo root is two levels up).
	const repoRoot = join(import.meta.dirname ?? __dirname, "..", "..", "..");
	await loadDotEnv(join(repoRoot, "apps", "web", ".env"));
	await loadDotEnv(join(repoRoot, ".env"));

	const target = resolveResearchTarget();
	console.error(`Using ${target.provider.id} (${target.model})\n`);

	const start = Date.now();
	const result = await analyzeBrand({ website, brandName });
	const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);

	console.log(JSON.stringify(result, null, 2));
	console.error(`\nDone in ${elapsedSec}s — ${result.competitors.length} competitors, ${result.suggestedPrompts.length} prompts.`);
}

main().catch((err) => {
	console.error("Error:", err instanceof Error ? err.message : err);
	process.exit(1);
});
