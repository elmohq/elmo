import fs from "node:fs/promises";
import path from "node:path";
import { runStructuredResearchPrompt } from "@workspace/lib/onboarding";
import { getWebsiteExcerpt } from "@workspace/lib/website-excerpt";
import type { Command } from "commander";
import { z } from "zod";
import { type BrandPack, type PlanSuggestion, readBrandPack } from "../core/brand-pack.js";
import { loadElmoEnv } from "../core/env.js";
import { parseFormat, printStdout, type Row, writeJson, writeStructured, writeText } from "../core/output.js";
import { applyResearchTarget } from "../core/targets.js";
import { log, routeLibraryLogsToStderr } from "../core/ui.js";
import { trackCliEvent } from "../telemetry.js";

interface PlanOptions {
	model?: string;
	website?: string;
	brandFile?: string;
	evalDir?: string;
	maxBytes: string;
	output: string;
	format: string;
	stdout?: boolean;
	dir?: string;
}

// Text-ish files we'll read when a directory is passed.
const TEXT_EXTENSIONS = new Set([
	".md",
	".mdx",
	".markdown",
	".txt",
	".html",
	".htm",
	".json",
	".csv",
	".rst",
	".text",
]);
const DEFAULT_MAX_BYTES = 200_000;

const planSchema = z.object({
	suggestions: z
		.array(
			z.object({
				title: z.string().describe("Short, action-oriented title for the recommendation."),
				category: z
					.string()
					.describe("A short category, e.g. content, structure, schema, authority, technical, comparison."),
				priority: z.enum(["high", "medium", "low"]).describe("Impact/effort priority."),
				recommendation: z.string().describe("Concrete, specific guidance — what to do and why it helps AI visibility."),
				evidence: z.string().optional().describe("What in the provided context motivates this (quote or reference)."),
			}),
		)
		.describe("Prioritized AEO/answer-engine-optimization recommendations grounded in the provided context."),
	competitors: z
		.array(
			z.object({
				name: z.string(),
				domains: z.array(z.string()).describe("Hostnames only, no protocol/www."),
				aliases: z.array(z.string()),
			}),
		)
		.describe("Direct competitors implied by the context (for tracking). Empty if uncertain."),
});

type PlanResult = z.infer<typeof planSchema>;

export function registerPlan(lab: Command): void {
	lab
		.command("plan")
		.description("generate AEO recommendations (+ competitors) from your content, optionally grounded in an eval")
		.argument("[paths...]", "files or directories to use as context")
		.option("-m, --model <target>", "research provider, model:provider[:version] (direct API only)")
		.option("--website <url>", "also pull a short excerpt from this site for context")
		.option("--brand-file <path>", "brand pack JSON for brand/competitor context (augmented on output)")
		.option("--eval-dir <path>", "an `elmo lab eval` output directory to ground recommendations in")
		.option("--max-bytes <n>", "cap on context bytes read from files", String(DEFAULT_MAX_BYTES))
		.option("-o, --output <dir>", "directory to write artifacts to", ".")
		.option("--format <csv|jsonl>", "structured output format", "csv")
		.option("--stdout", "print to stdout only; do not write files")
		.action(async (paths: string[], _opts: object, cmd: Command) => {
			const options = cmd.optsWithGlobals<PlanOptions>();
			await runPlan(paths, options);
		});
}

async function runPlan(paths: string[], options: PlanOptions): Promise<void> {
	routeLibraryLogsToStderr();
	const format = parseFormat(options.format);
	const maxBytes = Number(options.maxBytes) || DEFAULT_MAX_BYTES;

	const loaded = await loadElmoEnv(options.dir);
	applyResearchTarget(options.model);

	const pack = options.brandFile ? await readBrandPack(options.brandFile) : undefined;

	const context = await assembleContext(paths, options, maxBytes);
	if (!context.trim()) {
		throw new Error("No context to plan from. Pass files/directories, --website, --brand-file, or --eval-dir.");
	}

	log.step("Generating AEO recommendations…");
	const prompt = buildPlanPrompt(context, pack);
	const result = await runStructuredResearchPrompt<PlanResult>(prompt, planSchema);

	const markdown = renderPlanMarkdown(result, pack);
	printStdout(markdown);

	if (!options.stdout) {
		const dir = options.output;
		await writeText(dir, "plan.md", markdown);
		const suggestionRows: Row[] = result.suggestions.map((s, i) => ({
			n: i + 1,
			priority: s.priority,
			category: s.category,
			title: s.title,
			recommendation: s.recommendation,
			evidence: s.evidence ?? "",
		}));
		await writeStructured(
			dir,
			"suggestions",
			suggestionRows,
			["n", "priority", "category", "title", "recommendation", "evidence"],
			format,
		);
		const competitorRows: Row[] = result.competitors.map((c) => ({
			name: c.name,
			domains: c.domains,
			aliases: c.aliases,
		}));
		await writeStructured(dir, "competitors", competitorRows, ["name", "domains", "aliases"], format);
		await writeJson(dir, "brand.json", augmentBrandPack(pack, result, options));
		log.success(`Wrote plan.md, suggestions.${format}, competitors.${format}, brand.json to ${dir}.`);
	}

	if (loaded.configDir) {
		await trackCliEvent(loaded.configDir, "cli_lab_plan", {
			suggestion_count: result.suggestions.length,
			competitor_count: result.competitors.length,
			has_model: Boolean(options.model),
			has_eval: Boolean(options.evalDir),
			to_stdout: Boolean(options.stdout),
			format,
		});
	}
}

async function assembleContext(paths: string[], options: PlanOptions, maxBytes: number): Promise<string> {
	const parts: string[] = [];
	let budget = maxBytes;

	for (const p of paths) {
		const resolved = path.resolve(process.cwd(), p);
		const stat = await fs.stat(resolved).catch(() => null);
		if (!stat) {
			log.warn(`Skipping ${p}: not found.`);
			continue;
		}
		const files = stat.isDirectory() ? await walkTextFiles(resolved) : [resolved];
		for (const file of files) {
			if (budget <= 0) break;
			const content = await fs.readFile(file, "utf8").catch(() => "");
			if (!content.trim()) continue;
			const slice = content.slice(0, budget);
			budget -= slice.length;
			parts.push(`<<< FILE: ${path.relative(process.cwd(), file)} >>>\n${slice}`);
		}
	}

	if (options.website) {
		const excerpt = await getWebsiteExcerpt(options.website).catch(() => "");
		if (excerpt.trim()) parts.push(`<<< WEBSITE: ${options.website} >>>\n${excerpt}`);
	}

	if (options.evalDir) {
		const evalContext = await readEvalContext(options.evalDir);
		if (evalContext) parts.push(`<<< PRIOR ELMO EVAL FINDINGS >>>\n${evalContext}`);
	}

	return parts.join("\n\n");
}

async function walkTextFiles(dir: string, depth = 0): Promise<string[]> {
	if (depth > 6) return [];
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const out: string[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkTextFiles(full, depth + 1)));
		} else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
			out.push(full);
		}
	}
	return out.sort();
}

/** Pull the human-readable rollup from a prior eval to ground the plan. */
async function readEvalContext(evalDir: string): Promise<string> {
	const dir = path.resolve(process.cwd(), evalDir);
	const summary = await fs.readFile(path.join(dir, "summary.md"), "utf8").catch(() => "");
	if (summary.trim()) return summary;
	const runJson = await fs.readFile(path.join(dir, "run.json"), "utf8").catch(() => "");
	return runJson.trim();
}

function buildPlanPrompt(context: string, pack: BrandPack | undefined): string {
	const brandLine = pack?.brandName
		? `The brand is ${pack.brandName}${pack.website ? ` (${pack.website})` : ""}.`
		: "Infer the brand from the context.";
	return `You are an expert in Answer Engine Optimization (AEO) / Generative Engine Optimization — getting a brand cited and recommended by AI assistants like ChatGPT, Google AI Mode, Perplexity, and Claude.

${brandLine}

Using ONLY the context below (plus web search to verify facts), produce a prioritized set of concrete AEO recommendations to improve how often and how favorably AI answer engines surface this brand. Favor specific, implementable actions over generic advice. Ground each recommendation in the provided context, and prefer high-leverage moves: clear comparison/answer content, structured data, authoritative citations and mentions, fixing gaps where competitors are cited but the brand is not, and topical coverage of the unbranded queries buyers ask.

Also list the direct competitors implied by the context so they can be tracked.

CONTEXT:
${context}`;
}

function renderPlanMarkdown(result: PlanResult, pack: BrandPack | undefined): string {
	const lines: string[] = [];
	lines.push(`# AEO plan${pack?.brandName ? ` — ${pack.brandName}` : ""}`, "");
	const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
	const sorted = [...result.suggestions].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
	for (const s of sorted) {
		lines.push(`## [${s.priority.toUpperCase()}] ${s.title}`);
		lines.push(`*${s.category}*`, "");
		lines.push(s.recommendation);
		if (s.evidence) lines.push("", `> ${s.evidence}`);
		lines.push("");
	}
	if (result.competitors.length) {
		lines.push(`## Competitors to track`, "");
		for (const c of result.competitors) {
			lines.push(`- **${c.name}**${c.domains.length ? ` — ${c.domains.join(", ")}` : ""}`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

function augmentBrandPack(pack: BrandPack | undefined, result: PlanResult, options: PlanOptions): BrandPack {
	const suggestions: PlanSuggestion[] = result.suggestions.map((s) => ({
		title: s.title,
		category: s.category,
		priority: s.priority,
		recommendation: s.recommendation,
		evidence: s.evidence,
	}));
	const base: BrandPack = pack ?? {
		brandName: "",
		website: options.website ?? "",
		aliases: [],
		additionalDomains: [],
		competitors: [],
		prompts: [],
	};
	// Merge competitors by name, preferring existing entries.
	const byName = new Map(base.competitors.map((c) => [c.name.toLowerCase(), c]));
	for (const c of result.competitors) {
		if (!byName.has(c.name.toLowerCase())) {
			byName.set(c.name.toLowerCase(), { name: c.name, domains: c.domains, aliases: c.aliases });
		}
	}
	return { ...base, competitors: [...byName.values()], suggestions };
}
