#!/usr/bin/env tsx
/**
 * Multi-provider comparison harness for the brand-analysis (onboarding)
 * pipeline. Runs the same prompt + Zod schema through each configured direct
 * API provider in parallel and reports cost, latency, tokens (with cache /
 * reasoning breakdown), tool calls, and the resulting structured output.
 *
 * Providers compared (each must have its API key in env to participate):
 *   - anthropic-api: Anthropic native API + web_search_20250305 tool
 *   - openai-api:    OpenAI Responses API + web_search_preview tool
 *   - mistral-api:   Mistral Conversations API + web_search tool
 *   - openrouter:    OpenRouter chat/completions + plugins:[{web,native}],
 *                    routed to openai/gpt-5-mini
 *
 * Every path uses the underlying provider's *native* web search — no Exa
 * fallbacks, no plain-LLM-from-training mode.
 *
 * Usage:
 *   pnpm --filter @workspace/lib compare:onboarding nike.com
 *   pnpm --filter @workspace/lib compare:onboarding nike.com \
 *     --num-prompts 30 --num-branded 8 --num-competitors 12
 *   pnpm --filter @workspace/lib compare:onboarding nike.com --only anthropic-api,openrouter
 *   pnpm --filter @workspace/lib compare:onboarding nike.com --skip mistral-api
 *   pnpm --filter @workspace/lib compare:onboarding nike.com --env-file ~/code/elmo/apps/web/.env
 *
 * Reads `<repo>/apps/web/.env` and `<repo>/.env` automatically; --env-file
 * PATH overrides. Real env vars always win over .env entries.
 */
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { getProvider } from "../src/providers";

// ---------------------------------------------------------------------------
// Provider registry — keep in sync with packages/lib/src/providers/registry.
// Order is the default run order; --only / --skip filter from this list.
// ---------------------------------------------------------------------------

const PROVIDER_IDS = ["anthropic-api", "openai-api", "mistral-api", "openrouter"] as const;
type ProviderId = (typeof PROVIDER_IDS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveHomePath(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
	return resolve(p);
}

/**
 * Race a promise against a timeout and reject with a clear message if it
 * didn't resolve in time. Note: the underlying LLM call keeps running and
 * billing tokens — providers that accept an AbortSignal would need plumbing
 * through StructuredResearchOptions to actually stop.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${label} timed out after ${(timeoutMs / 1000).toFixed(0)}s`)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

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
// Shared schema + prompt — each provider gets identical input so the
// comparison reflects model/provider differences, not prompt drift.
// ---------------------------------------------------------------------------

const TAG_GUIDANCE =
	"Tags should be tailored to this specific brand and the prompt set you're producing. Aim for tags that describe WHAT a prompt is about (a product category, audience segment, sub-feature, competitor name) — not WHAT the user wants to do with the answer (compare, evaluate, buy). Goal-style intent tags tend to apply to most prompts in the set and don't discriminate. Prefer single-word tags; only use multi-word tags (lowercase, single hyphens between words) when no single word captures the concept. Each tag should describe ONE axis — don't fuse two ideas into a compound hyphenated label. Don't use 'branded' or 'unbranded' as tag values; the system computes that classification automatically from the prompt text. Pick a small shared vocabulary (no more than 5 distinct values across all prompts), and only attach a tag to a prompt if it actually discriminates that prompt from others — if the same tag would apply to most prompts, don't use it.";

const ALIAS_GUIDANCE =
	"Skip variants that contain the canonical name as a substring (e.g. don't add \"Asics America\" for \"Asics\" — substring matching catches it already). DO include genuinely distinct names like parent companies or sub-brands the company owns (e.g. \"Converse\" for Nike).";

function buildSchema(args: { numPrompts: number; numBranded: number; numCompetitors: number }) {
	return z.object({
		brandName: z
			.string()
			.describe(
				"Canonical brand name in plaintext (preserve casing, but no markdown — no links, no formatting, just the bare name). The brandName must be searchable: it should literally appear inside the website hostname so that mention-detection works. For example, for nike.com use \"Nike\" (not \"Nike, Inc.\"); for hera.video use \"Hera\" (not \"Hera Video, Inc.\"). Don't include legal entity suffixes like \"Inc.\" or \"Ltd.\"",
			),
		additionalDomains: z
			.array(z.string())
			.describe(
				"Other public domains the brand owns (regional ccTLDs, alt spellings, parent-company sites). Hostnames only.",
			),
		aliases: z.array(z.string()).describe(`Other names the brand is commonly known by. ${ALIAS_GUIDANCE} Empty if none.`),
		products: z
			.array(z.string())
			.describe('3-5 short generic product/service categories (lowercase, no brand names).'),
		competitors: z
			.array(
				z.object({
					name: z.string(),
					domain: z.string().describe(`Hostname only — no protocol, no www, no path (e.g. "example.com")`),
					additionalDomains: z.array(z.string()),
					aliases: z.array(z.string()).describe(`Other names the company is commonly known by. ${ALIAS_GUIDANCE}`),
				}),
			)
			.describe(`Up to ${args.numCompetitors} direct competitors. Empty if uncertain.`),
		suggestedPrompts: z
			.array(
				z.object({
					prompt: z
						.string()
						.describe("Lowercase fragment, under ~12 words, NOT a full sentence — the kind users type into ChatGPT."),
					tags: z
						.array(z.string())
						.describe(`1-3 tags per prompt (ideally 1-2), drawn from the shared brand-tailored vocabulary. ${TAG_GUIDANCE}`),
				}),
			)
			.describe(
				`Exactly ${args.numPrompts} prompts. ${args.numBranded} of them MUST include the brand name directly. The rest should be unbranded — category, persona, or audience-targeted prompts. ${TAG_GUIDANCE}`,
			),
	});
}

type Suggestion = z.infer<ReturnType<typeof buildSchema>>;

function buildUserPrompt(args: { website: string; numPrompts: number; numBranded: number; numCompetitors: number }): string {
	return `I'm the owner of ${args.website}. I want to track ${args.numPrompts} AEO/AI-visibility-related prompts in tools like ChatGPT, Claude, and Gemini. ${args.numBranded} of those prompts should include the brand's name (e.g. "${args.website} alternative"). The remaining ${args.numPrompts - args.numBranded} should be unbranded — category, persona, or audience-targeted prompts that someone making a purchasing decision might type into an AI assistant.

Use web search if available to verify current market info. Return:
  - the canonical brand name, additional domains the brand owns, and any common aliases
  - 3-5 short generic product categories
  - up to ${args.numCompetitors} direct competitors (with their own primary domain, additional domains, and aliases)
  - the ${args.numPrompts} suggested AI tracking prompts (${args.numBranded} branded + ${args.numPrompts - args.numBranded} unbranded), each tagged with 1-3 (ideally 1-2) tags from a shared brand-tailored vocabulary you invent.

Tag guidelines: ${TAG_GUIDANCE}

Alias guidelines: ${ALIAS_GUIDANCE}

You MUST return the structured JSON object — even if web search and your training data have nothing on this brand. In that case set brandName to your best guess from the domain, return empty arrays for additionalDomains/aliases/competitors, and infer products + suggestedPrompts from the domain TLD or any text snippet you can find. Refusing to produce JSON, or replying with prose explaining what you don't know, is a failure; an object with mostly-empty arrays is the correct response when information is genuinely unavailable.

Never invent specific facts (real domains, real competitor names) — return empty arrays for those when uncertain. But the suggestedPrompts list is generative, not factual: you can still produce 20 plausible AEO prompts for a category even when the brand itself is obscure.`;
}

// ---------------------------------------------------------------------------
// Result shape + tag normalization
// ---------------------------------------------------------------------------

interface RunResult {
	providerId: ProviderId;
	model: string;
	elapsedMs: number;
	suggestion: Suggestion;
	/** Number of suggestedPrompts production would classify as "branded". */
	brandedCount: number;
}

interface RunFailure {
	providerId: ProviderId;
	error: string;
	elapsedMs: number;
}

/**
 * Mirror packages/lib/src/onboarding/analyze.ts so the comparison reflects
 * what production would actually store — kebab-case tags, deduped, capped at
 * 3 per prompt.
 */
function toKebabCase(tag: string): string {
	return tag
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeSuggestion(s: Suggestion): Suggestion {
	return {
		...s,
		suggestedPrompts: s.suggestedPrompts.map((p) => {
			const seen = new Set<string>();
			const tags: string[] = [];
			for (const raw of p.tags) {
				const t = toKebabCase(raw);
				if (!t || seen.has(t)) continue;
				seen.add(t);
				tags.push(t);
				if (tags.length >= 3) break;
			}
			return { ...p, prompt: p.prompt.trim().toLowerCase(), tags };
		}),
	};
}

// ---------------------------------------------------------------------------
// Per-provider runner
// ---------------------------------------------------------------------------

interface RunArgs {
	website: string;
	numPrompts: number;
	numBranded: number;
	numCompetitors: number;
	timeoutMs: number;
}

async function runProvider(providerId: ProviderId, args: RunArgs): Promise<RunResult> {
	const provider = getProvider(providerId);
	if (!provider.isConfigured()) {
		throw new Error(`${providerId}: not configured (missing API key in env)`);
	}
	if (!provider.runStructuredResearch) {
		throw new Error(`${providerId}: provider doesn't implement structured research`);
	}
	const schema = buildSchema(args);
	const prompt = buildUserPrompt(args);
	const start = Date.now();
	const result = await withTimeout(
		provider.runStructuredResearch({ prompt, schema }),
		args.timeoutMs,
		`${providerId} engine`,
	);
	const elapsedMs = Date.now() - start;
	const model = result.modelVersion ?? "(unknown)";
	const suggestion = normalizeSuggestion(result.object as Suggestion);
	const brandedCount = countBrandedPrompts(suggestion, args.website);
	return { providerId, model, elapsedMs, suggestion, brandedCount };
}

/**
 * Match production's `isPromptBranded` (packages/lib/src/tag-utils.ts):
 * a prompt counts as branded if it contains the brandName, the website
 * hostname, or the domain root (e.g. "hera" for hera.video). Without the
 * domain-root fallback, providers that returned brandName="Hera Video"
 * would show 0 even though all 5 branded prompts say "hera.video".
 */
function countBrandedPrompts(s: Suggestion, website: string): number {
	const brandLower = s.brandName.toLowerCase();
	let host = website.toLowerCase();
	try {
		const u = new URL(host.startsWith("http") ? host : `https://${host}`);
		host = u.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		// fall through with the input as-is
	}
	const domainRoot = host.split(".")[0];
	return s.suggestedPrompts.filter((p) => {
		const lower = p.prompt.toLowerCase();
		return (
			(brandLower && lower.includes(brandLower)) ||
			(host && lower.includes(host)) ||
			(domainRoot && lower.includes(domainRoot))
		);
	}).length;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
	return `${(ms / 1000).toFixed(2)}s`;
}

function summary(r: RunResult): string {
	const tagVocab = new Set<string>();
	for (const p of r.suggestion.suggestedPrompts) for (const t of p.tags) tagVocab.add(t);
	return [
		`  provider:  ${r.providerId}`,
		`  model:     ${r.model}`,
		`  elapsed:   ${formatMs(r.elapsedMs)}`,
		`  brand:     ${r.suggestion.brandName}`,
		`  domains:   ${r.suggestion.additionalDomains.length}`,
		`  aliases:   ${r.suggestion.aliases.length}`,
		`  products:  ${r.suggestion.products.length}`,
		`  competit:  ${r.suggestion.competitors.length}`,
		`  prompts:   ${r.suggestion.suggestedPrompts.length} (${r.brandedCount} branded by name)`,
		`  tag vocab: ${tagVocab.size} distinct — ${[...tagVocab].sort().join(", ") || "(none)"}`,
	].join("\n");
}

/** RFC 4180-style CSV escaping: wrap in quotes if needed, double internal quotes. */
function csvEscape(value: string | number | undefined | null): string {
	if (value === undefined || value === null) return "";
	const s = String(value);
	if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

const CSV_HEADERS = [
	"provider",
	"status",
	"model",
	"elapsed_s",
	"brand",
	"domains",
	"aliases",
	"products",
	"competitors",
	"prompts",
	"branded_by_name",
	"tag_vocab_size",
	"tags",
	"error",
] as const;

function rowFromResult(r: RunResult): string {
	const tagVocab = new Set<string>();
	for (const p of r.suggestion.suggestedPrompts) for (const t of p.tags) tagVocab.add(t);
	const cells = [
		r.providerId,
		"ok",
		r.model,
		(r.elapsedMs / 1000).toFixed(2),
		r.suggestion.brandName,
		r.suggestion.additionalDomains.length,
		r.suggestion.aliases.length,
		r.suggestion.products.length,
		r.suggestion.competitors.length,
		r.suggestion.suggestedPrompts.length,
		r.brandedCount,
		tagVocab.size,
		[...tagVocab].sort().join(","),
		"",
	];
	return cells.map(csvEscape).join(",");
}

function rowFromFailure(f: RunFailure): string {
	// Header has 14 columns: provider, status, model, elapsed_s, then 9 empty
	// metric/output cells, then error.
	const cells: (string | number)[] = [
		f.providerId,
		"failed",
		"", // model
		(f.elapsedMs / 1000).toFixed(2),
		...Array(9).fill(""),
		f.error.split("\n")[0],
	];
	return cells.map(csvEscape).join(",");
}

const PROMPT_CSV_HEADERS = ["provider", "prompt_index", "prompt", "tags"] as const;

function promptRowsFromResult(r: RunResult): string[] {
	return r.suggestion.suggestedPrompts.map((p, i) => {
		const cells = [r.providerId, i + 1, p.prompt, p.tags.join(",")];
		return cells.map(csvEscape).join(",");
	});
}

function tabulatedComparison(results: RunResult[]): string {
	if (results.length === 0) return "";
	const sorted = [...results].sort((a, b) => a.elapsedMs - b.elapsedMs);
	const lines = ["", "----- COMPARISON (sorted by elapsed time, fastest first) -----", ""];
	const colName = "provider";
	const nameWidth = Math.max(colName.length, ...sorted.map((r) => r.providerId.length));
	lines.push(
		`  ${colName.padEnd(nameWidth)}  ${"time".padStart(8)}  ${"branded".padStart(8)}  ${"competit".padStart(8)}  ${"tag vocab".padStart(10)}`,
	);
	for (const r of sorted) {
		const tagVocab = new Set<string>();
		for (const p of r.suggestion.suggestedPrompts) for (const t of p.tags) tagVocab.add(t);
		lines.push(
			`  ${r.providerId.padEnd(nameWidth)}  ${formatMs(r.elapsedMs).padStart(8)}  ${String(r.brandedCount).padStart(8)}  ${String(r.suggestion.competitors.length).padStart(8)}  ${String(tagVocab.size).padStart(10)}`,
		);
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseList(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function isProviderId(id: string): id is ProviderId {
	return (PROVIDER_IDS as readonly string[]).includes(id);
}

async function main() {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			"num-prompts": { type: "string", default: "20" },
			"num-branded": { type: "string", default: "5" },
			"num-competitors": { type: "string", default: "10" },
			only: { type: "string" },
			skip: { type: "string" },
			"env-file": { type: "string" },
			timeout: { type: "string", default: "180" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (values.help || positionals.length === 0) {
		console.error("Usage: tsx compare-onboarding.ts <website> [options]");
		console.error("");
		console.error("Options:");
		console.error("  --num-prompts N       Total prompts to request (default 20)");
		console.error("  --num-branded N       How many should be branded (default 5)");
		console.error("  --num-competitors N   Max competitors to request (default 10)");
		console.error(`  --only IDS            Comma-separated provider IDs to run (default all of: ${PROVIDER_IDS.join(",")})`);
		console.error("  --skip IDS            Comma-separated provider IDs to skip");
		console.error("  --env-file PATH       Load API keys from this .env before defaults");
		console.error("  --timeout SECONDS     Hard timeout per provider (default 180)");
		console.error("");
		console.error("Each provider needs its own API key in env to participate;");
		console.error("missing-key providers are silently skipped, not treated as failures.");
		console.error("");
		console.error("Example:");
		console.error("  pnpm --filter @workspace/lib compare:onboarding nike.com");
		console.error("  pnpm --filter @workspace/lib compare:onboarding nike.com --only anthropic-api,openrouter");
		console.error("  pnpm --filter @workspace/lib compare:onboarding nike.com --env-file ~/code/elmo/apps/web/.env");
		process.exit(values.help ? 0 : 1);
	}

	const website = positionals[0];
	const numPrompts = Number(values["num-prompts"]);
	const numBranded = Number(values["num-branded"]);
	const numCompetitors = Number(values["num-competitors"]);
	const timeoutMs = Number(values.timeout) * 1000;
	if (numBranded > numPrompts) {
		console.error("--num-branded cannot exceed --num-prompts");
		process.exit(1);
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
		console.error("--timeout must be a positive number of seconds (>=1)");
		process.exit(1);
	}

	if (values["env-file"]) {
		const explicit = resolveHomePath(values["env-file"]);
		try {
			await readFile(explicit, "utf8");
		} catch (err) {
			console.error(`--env-file ${explicit} could not be read: ${err instanceof Error ? err.message : err}`);
			process.exit(1);
		}
		await loadDotEnv(explicit);
	}
	const repoRoot = join(import.meta.dirname ?? __dirname, "..", "..", "..");
	await loadDotEnv(join(repoRoot, "apps", "web", ".env"));
	await loadDotEnv(join(repoRoot, ".env"));

	// Determine which providers to run.
	const onlyList = parseList(values.only);
	const skipList = parseList(values.skip);
	for (const id of [...onlyList, ...skipList]) {
		if (!isProviderId(id)) {
			console.error(`Unknown provider id: "${id}". Valid: ${PROVIDER_IDS.join(", ")}`);
			process.exit(1);
		}
	}
	const targets = (onlyList.length > 0 ? onlyList : [...PROVIDER_IDS]).filter(
		(id): id is ProviderId => isProviderId(id) && !skipList.includes(id),
	);
	if (targets.length === 0) {
		console.error("No providers to run after applying --only / --skip filters.");
		process.exit(1);
	}

	const runArgs: RunArgs = { website, numPrompts, numBranded, numCompetitors, timeoutMs };

	// Run all configured providers in parallel. Stream a "→" line on start
	// and a "✓"/"✗" line on completion so the user sees progress for each.
	const results: RunResult[] = [];
	const failures: RunFailure[] = [];

	const runs = targets.map(async (providerId): Promise<void> => {
		const provider = getProvider(providerId);
		if (!provider.isConfigured()) {
			console.error(`○ ${providerId}: skipped (no API key configured)`);
			return;
		}
		console.error(`→ ${providerId}: starting`);
		const start = Date.now();
		try {
			const result = await runProvider(providerId, runArgs);
			console.error(`✓ ${providerId}: done in ${formatMs(result.elapsedMs)}`);
			results.push(result);
		} catch (err) {
			const elapsedMs = Date.now() - start;
			const message = err instanceof Error ? err.message : String(err);
			console.error(`✗ ${providerId}: failed after ${formatMs(elapsedMs)} — ${message.split("\n")[0]}`);
			failures.push({ providerId, error: message, elapsedMs });
		}
	});
	await Promise.all(runs);

	// Print full per-provider summary blocks + tabulated comparison to stderr
	// (human-readable). Stdout gets just the CSV so `> results.csv` captures
	// clean parseable output.
	if (results.length > 0) {
		console.error("\n========== SUMMARY ==========");
		for (const r of results) {
			console.error(`\n[${r.providerId}]`);
			console.error(summary(r));
		}
	}
	for (const f of failures) {
		console.error(`\n[${f.providerId}] FAILED`);
		console.error(`  ${f.error.split("\n").join("\n  ")}`);
	}
	if (results.length >= 2) {
		console.error(tabulatedComparison(results));
	}

	// Two CSV blocks on stdout, separated by a blank line:
	//   1. Summary — one row per provider (success or failure)
	//   2. Prompts — one row per (provider, prompt) so you can compare the
	//      actual prompt text + tags side-by-side across providers
	// awk '/^$/{n++;next} {print > "out"n".csv"}' splits them; pandas can
	// read one section at a time with skiprows + nrows.
	console.log(CSV_HEADERS.join(","));
	for (const r of results) console.log(rowFromResult(r));
	for (const f of failures) console.log(rowFromFailure(f));

	console.log("");
	console.log(PROMPT_CSV_HEADERS.join(","));
	for (const r of results) for (const row of promptRowsFromResult(r)) console.log(row);

	if (results.length === 0) process.exit(1);
}

main().catch((err) => {
	console.error("Error:", err instanceof Error ? err.stack || err.message : err);
	process.exit(1);
});
