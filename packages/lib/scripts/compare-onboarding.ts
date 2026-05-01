#!/usr/bin/env tsx
/**
 * Side-by-side comparison of two brand-analysis approaches:
 *
 *   1. "elmo"     — the production path (`analyzeBrand` from
 *                   @workspace/lib/onboarding) using AI SDK `generateObject`
 *                   / `generateText` against whichever direct API is
 *                   configured.
 *   2. "opencode" — the same Zod schema, but driven through the OpenCode
 *                   SDK's structured-output flow (`session.prompt` with a
 *                   JSON Schema `format`). Spawns a local OpenCode server.
 *
 * Both run with the user-described prompt: "I'm the owner of <site>. I want
 * to track N AEO prompts, K of which include the brand name." The same
 * prompt flows into both engines so we can compare quality/cost/latency.
 *
 * Usage:
 *   pnpm --filter @workspace/lib compare:onboarding nike.com
 *   pnpm --filter @workspace/lib compare:onboarding nike.com \
 *     --num-prompts 30 --num-branded 8 --num-competitors 12 \
 *     --skip elmo            # or --skip opencode
 *
 * Reads apps/web/.env automatically. Honors ONBOARDING_LLM_TARGET if you
 * want to force a specific provider/model on the elmo path. The opencode
 * path always picks the first configured direct API in the same
 * preference order (OpenRouter → Anthropic → OpenAI → Mistral).
 */
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { runStructuredResearchPromptWithMetrics } from "../src/onboarding/llm";

// ---------------------------------------------------------------------------
// .env loading (mirrors test-onboarding.ts so users only set keys once)
// ---------------------------------------------------------------------------

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
		if (process.env[key] === undefined) process.env[key] = value;
	}
}

// ---------------------------------------------------------------------------
// Pricing (USD per million tokens). Best-effort snapshot, override via
// MODEL_PRICING env if the rates drift. Used only by the elmo path; OpenCode
// returns cost directly.
// ---------------------------------------------------------------------------

interface PriceEntry {
	input: number;
	output: number;
}

const DEFAULT_PRICING: Record<string, PriceEntry> = {
	"claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
	"claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
	"gpt-5-mini": { input: 0.25, output: 2.0 },
	"gpt-5": { input: 1.25, output: 10.0 },
	"google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
	"google/gemini-2.5-pro": { input: 1.25, output: 10.0 },
	"mistral-medium-latest": { input: 0.4, output: 2.0 },
	"mistral-large-latest": { input: 2.0, output: 6.0 },
};

function priceForModel(model: string): PriceEntry | undefined {
	const stripped = model.replace(/:online$/, "");
	return DEFAULT_PRICING[stripped] ?? DEFAULT_PRICING[model];
}

function estimateCost(usage: { inputTokens: number; outputTokens: number }, model: string): number | undefined {
	const price = priceForModel(model);
	if (!price) return undefined;
	return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Shared schema + prompt (so both engines are scored on identical input)
// ---------------------------------------------------------------------------

const PROMPT_TAGS = [
	"comparison",
	"best-of",
	"alternative",
	"recommendation",
	"use-case",
	"branded",
	"transactional",
	"informational",
	"persona",
] as const;

function buildSchema(args: { numPrompts: number; numBranded: number; numCompetitors: number }) {
	return z.object({
		brandName: z.string().describe("Canonical brand name (preserve casing)"),
		additionalDomains: z
			.array(z.string())
			.describe(
				"Other public domains the brand owns (regional ccTLDs, alt spellings, parent-company sites). Hostnames only.",
			),
		aliases: z.array(z.string()).describe("Other names the brand is commonly known by. Empty if none."),
		products: z
			.array(z.string())
			.describe('3-5 short generic product/service categories (lowercase, no brand names).'),
		competitors: z
			.array(
				z.object({
					name: z.string(),
					domain: z.string().describe(`Hostname only — no protocol, no www, no path (e.g. "example.com")`),
					additionalDomains: z.array(z.string()),
					aliases: z.array(z.string()),
				}),
			)
			.describe(`Up to ${args.numCompetitors} direct competitors. Empty if uncertain.`),
		suggestedPrompts: z
			.array(
				z.object({
					prompt: z
						.string()
						.describe("Lowercase fragment, under ~12 words, NOT a full sentence — the kind users type into ChatGPT."),
					tags: z.array(z.enum(PROMPT_TAGS)),
				}),
			)
			.describe(
				`Exactly ${args.numPrompts} prompts. ${args.numBranded} of them MUST include the brand name directly (tag with "branded"). The rest should be unbranded category/comparison/persona prompts.`,
			),
	});
}

type Suggestion = z.infer<ReturnType<typeof buildSchema>>;

function buildUserPrompt(args: { website: string; numPrompts: number; numBranded: number; numCompetitors: number }): string {
	return `I'm the owner of ${args.website}. I want to track ${args.numPrompts} AEO/AI-visibility-related prompts in tools like ChatGPT, Claude, and Gemini. ${args.numBranded} of those prompts should include the brand's name (e.g. "${args.website} alternative"). The remaining ${args.numPrompts - args.numBranded} should be unbranded — category, comparison, or persona-style prompts that someone making a purchasing decision might type into an AI assistant.

Use web search if available to verify current market info. Return:
  - the canonical brand name, additional domains the brand owns, and any common aliases
  - 3-5 short generic product categories
  - up to ${args.numCompetitors} direct competitors (with their own primary domain, additional domains, and aliases)
  - the ${args.numPrompts} suggested AI tracking prompts (${args.numBranded} branded + ${args.numPrompts - args.numBranded} unbranded), each tagged with 1-2 categories from: comparison, best-of, alternative, recommendation, use-case, branded, transactional, informational, persona.

Never invent data — return empty arrays for fields you can't fill confidently.`;
}

// ---------------------------------------------------------------------------
// Engine 1: elmo (production path)
// ---------------------------------------------------------------------------

interface RunResult {
	engine: string;
	model: string;
	elapsedMs: number;
	usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
	costUsd?: number;
	suggestion: Suggestion;
}

async function runElmo(args: {
	website: string;
	numPrompts: number;
	numBranded: number;
	numCompetitors: number;
}): Promise<RunResult> {
	const schema = buildSchema(args);
	const prompt = buildUserPrompt(args);
	const start = Date.now();
	const result = await runStructuredResearchPromptWithMetrics(prompt, { schema });
	const elapsedMs = Date.now() - start;
	const model = result.modelVersion ?? "(unknown)";
	const costUsd = result.usage ? estimateCost(result.usage, model) : undefined;
	return { engine: "elmo", model, elapsedMs, usage: result.usage, costUsd, suggestion: result.object };
}

// ---------------------------------------------------------------------------
// Engine 2: opencode (OpenCode SDK structured output)
// ---------------------------------------------------------------------------

interface OpencodeProviderConfig {
	envKey: string;
	providerID: string;
	modelID: string;
}

const OPENCODE_PREFERENCE: OpencodeProviderConfig[] = [
	{ envKey: "OPENROUTER_API_KEY", providerID: "openrouter", modelID: "google/gemini-2.5-flash" },
	{ envKey: "ANTHROPIC_API_KEY", providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
	{ envKey: "OPENAI_API_KEY", providerID: "openai", modelID: "gpt-5-mini" },
	{ envKey: "MISTRAL_API_KEY", providerID: "mistral", modelID: "mistral-medium-latest" },
];

function pickOpencodeProvider(): OpencodeProviderConfig {
	for (const p of OPENCODE_PREFERENCE) {
		if (process.env[p.envKey]) return p;
	}
	throw new Error(
		"opencode engine requires one of: OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, MISTRAL_API_KEY",
	);
}

async function runOpencode(args: {
	website: string;
	numPrompts: number;
	numBranded: number;
	numCompetitors: number;
}): Promise<RunResult> {
	// Lazy-import so the SDK only spawns its server when this engine runs.
	const { createOpencode } = await import("@opencode-ai/sdk/v2");
	const provider = pickOpencodeProvider();
	const schema = buildSchema(args);
	const prompt = buildUserPrompt(args);

	const { client, server } = await createOpencode();
	try {
		// Wire up provider auth so the OpenCode server can talk to the LLM.
		const apiKey = process.env[provider.envKey];
		if (!apiKey) throw new Error(`${provider.envKey} unset after pickOpencodeProvider`);
		await client.auth.set({ providerID: provider.providerID, auth: { type: "api", key: apiKey } });

		const session = await client.session.create({ title: `compare-onboarding ${args.website}` });
		const sessionID = (session.data as any)?.id;
		if (!sessionID) throw new Error("OpenCode session.create returned no id");

		const start = Date.now();
		const response = await client.session.prompt({
			sessionID,
			model: { providerID: provider.providerID, modelID: provider.modelID },
			parts: [{ type: "text", text: prompt }],
			format: { type: "json_schema", schema: z.toJSONSchema(schema) as any },
		});
		const elapsedMs = Date.now() - start;

		const info = (response.data as any)?.info;
		if (!info) throw new Error("OpenCode session.prompt returned no info");
		if (info.error) throw new Error(`OpenCode error: ${JSON.stringify(info.error)}`);

		const structured = info.structured;
		if (!structured) throw new Error("OpenCode response had no structured output");

		const parsed = schema.parse(structured);
		const usage = info.tokens
			? {
					inputTokens: info.tokens.input ?? 0,
					outputTokens: info.tokens.output ?? 0,
					totalTokens: info.tokens.total ?? (info.tokens.input ?? 0) + (info.tokens.output ?? 0),
				}
			: undefined;

		return {
			engine: "opencode",
			model: `${info.providerID ?? provider.providerID}/${info.modelID ?? provider.modelID}`,
			elapsedMs,
			usage,
			costUsd: typeof info.cost === "number" ? info.cost : undefined,
			suggestion: parsed,
		};
	} finally {
		server.close();
	}
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatUsd(cost: number | undefined): string {
	if (cost === undefined) return "n/a";
	if (cost < 0.0001) return `$${(cost * 1_000_000).toFixed(2)}µ`;
	if (cost < 0.01) return `$${(cost * 1000).toFixed(3)}m`;
	return `$${cost.toFixed(4)}`;
}

function formatTokens(usage: RunResult["usage"]): string {
	if (!usage) return "n/a";
	return `${usage.inputTokens} in + ${usage.outputTokens} out = ${usage.totalTokens}`;
}

function formatMs(ms: number): string {
	return `${(ms / 1000).toFixed(2)}s`;
}

function summary(r: RunResult): string {
	return [
		`  engine:    ${r.engine}`,
		`  model:     ${r.model}`,
		`  elapsed:   ${formatMs(r.elapsedMs)}`,
		`  tokens:    ${formatTokens(r.usage)}`,
		`  cost:      ${formatUsd(r.costUsd)}`,
		`  brand:     ${r.suggestion.brandName}`,
		`  domains:   ${r.suggestion.additionalDomains.length}`,
		`  aliases:   ${r.suggestion.aliases.length}`,
		`  products:  ${r.suggestion.products.length}`,
		`  competit:  ${r.suggestion.competitors.length}`,
		`  prompts:   ${r.suggestion.suggestedPrompts.length} (${r.suggestion.suggestedPrompts.filter((p) => p.tags.includes("branded")).length} branded)`,
	].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			"num-prompts": { type: "string", default: "20" },
			"num-branded": { type: "string", default: "5" },
			"num-competitors": { type: "string", default: "10" },
			skip: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (values.help || positionals.length === 0) {
		console.error("Usage: tsx compare-onboarding.ts <website> [options]");
		console.error("");
		console.error("Options:");
		console.error("  --num-prompts N      Total prompts to request (default 20)");
		console.error("  --num-branded N      How many should be branded (default 5)");
		console.error("  --num-competitors N  Max competitors to request (default 10)");
		console.error("  --skip elmo|opencode Run only one engine");
		console.error("");
		console.error("Example:");
		console.error("  pnpm --filter @workspace/lib compare:onboarding nike.com");
		console.error("  pnpm --filter @workspace/lib compare:onboarding nike.com --num-prompts 30 --num-branded 8");
		process.exit(values.help ? 0 : 1);
	}

	const website = positionals[0];
	const numPrompts = Number(values["num-prompts"]);
	const numBranded = Number(values["num-branded"]);
	const numCompetitors = Number(values["num-competitors"]);
	if (numBranded > numPrompts) {
		console.error("--num-branded cannot exceed --num-prompts");
		process.exit(1);
	}

	// Load .env from common spots so users only set keys once.
	const repoRoot = join(import.meta.dirname ?? __dirname, "..", "..", "..");
	await loadDotEnv(join(repoRoot, "apps", "web", ".env"));
	await loadDotEnv(join(repoRoot, ".env"));

	const skip = values.skip;
	const runArgs = { website, numPrompts, numBranded, numCompetitors };
	const results: RunResult[] = [];

	if (skip !== "elmo") {
		console.error("→ Running elmo engine...");
		try {
			results.push(await runElmo(runArgs));
		} catch (err) {
			console.error(`  elmo failed: ${err instanceof Error ? err.message : err}`);
		}
	}
	if (skip !== "opencode") {
		console.error("→ Running opencode engine...");
		try {
			results.push(await runOpencode(runArgs));
		} catch (err) {
			console.error(`  opencode failed: ${err instanceof Error ? err.message : err}`);
		}
	}

	if (results.length === 0) {
		console.error("\nBoth engines failed.");
		process.exit(1);
	}

	console.error("\n========== SUMMARY ==========");
	for (const r of results) {
		console.error(`\n[${r.engine}]`);
		console.error(summary(r));
	}

	if (results.length === 2) {
		const [a, b] = results;
		console.error("\n----- DELTAS (opencode vs elmo) -----");
		const elmo = results.find((r) => r.engine === "elmo");
		const opencode = results.find((r) => r.engine === "opencode");
		if (elmo && opencode) {
			const dt = opencode.elapsedMs - elmo.elapsedMs;
			console.error(`  time:  ${dt > 0 ? "+" : ""}${formatMs(dt)} (${((dt / elmo.elapsedMs) * 100).toFixed(0)}%)`);
			if (elmo.costUsd !== undefined && opencode.costUsd !== undefined) {
				const dc = opencode.costUsd - elmo.costUsd;
				console.error(`  cost:  ${dc > 0 ? "+" : ""}${formatUsd(Math.abs(dc))}${dc > 0 ? " more" : " less"}`);
			}
		}
	}

	console.error("\n========== FULL RESULTS (JSON) ==========");
	console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
	console.error("Error:", err instanceof Error ? err.stack || err.message : err);
	process.exit(1);
});
