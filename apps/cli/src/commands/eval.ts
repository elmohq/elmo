import fs from "node:fs/promises";
import path from "node:path";
import { getRunsPerPrompt, WEB_QUERIES_UNAVAILABLE } from "@workspace/lib/constants";
import { createMentionAnalyzer, type MentionAnalyzer } from "@workspace/lib/mention-judge";
import type { MentionConfig } from "@workspace/lib/mentions";
import type { OnboardingCompetitor } from "@workspace/lib/onboarding";
import {
	computeCompetitorSoVs,
	computeOverallSoV,
	computePromptSoV,
	type FullPromptRun,
	findContentGaps,
	type ReportCompetitor,
	type ReportPromptRun,
} from "@workspace/lib/report-metrics";
import { extractorFor, extractRun } from "@workspace/lib/text-extraction";
import type { Command } from "commander";
import {
	type BrandPack,
	readBrandPack,
	toMentionBrand,
	toMentionCompetitors,
	toReportCompetitors,
} from "../core/brand-pack.js";
import { loadElmoEnv } from "../core/env.js";
import {
	type DataFormat,
	ensureDir,
	pad,
	parseFormat,
	printStdout,
	type Row,
	slugify,
	toCsv,
	writeJson,
	writeStructured,
	writeText,
} from "../core/output.js";
import { mapPool } from "../core/pool.js";
import {
	buildEvalReportHtml,
	type EvalPromptResult,
	type EvalReport,
	type EvalRun,
	type EvalTargetResult,
} from "../core/report-html.js";
import { type ResolvedTarget, resolveTargets } from "../core/targets.js";
import { log, routeLibraryLogsToStderr } from "../core/ui.js";
import { trackCliEvent } from "../telemetry.js";

interface EvalOptions {
	model?: string[];
	runs: string;
	prompt?: string[];
	promptsFile?: string;
	brandFile?: string;
	brand?: string;
	brandDomain?: string;
	alias?: string[];
	competitor?: string[];
	output: string;
	format: string;
	stdout?: boolean;
	concurrency: string;
	dir?: string;
}

function collect(value: string, previous: string[] = []): string[] {
	return previous.concat([value]);
}

export function registerEval(lab: Command): void {
	lab
		.command("eval")
		.description("run prompts across providers → responses, citations, mentions, share-of-voice, fan-out")
		.argument("[prompts...]", "prompts to evaluate (or use --prompt / --prompts-file / --brand-file / stdin)")
		.option("-m, --model <target>", "model:provider[:version][:online] (repeatable; default: SCRAPE_TARGETS)", collect)
		.option("-n, --runs <count>", "replications per prompt per target", String(getRunsPerPrompt()))
		.option("--prompt <text>", "a prompt to evaluate (repeatable)", collect)
		.option("--prompts-file <path>", "file with one prompt per line ('-' for stdin)")
		.option("--brand-file <path>", "brand pack JSON (from `elmo lab brainstorm`) for prompts + mention context")
		.option("--brand <name>", "brand name for mention detection")
		.option("--brand-domain <domain>", "brand website/domain for mention detection")
		.option("--alias <name>", "brand alias for mention detection (repeatable)", collect)
		.option("--competitor <name:domain>", "competitor for share-of-voice (repeatable)", collect)
		.option("-o, --output <dir>", "directory to write artifacts to", ".")
		.option("--format <csv|jsonl>", "structured output format", "csv")
		.option("--stdout", "print to stdout only; do not write files")
		.option("--concurrency <n>", "max concurrent provider calls", "4")
		.action(async (prompts: string[], _opts: object, cmd: Command) => {
			const options = cmd.optsWithGlobals<EvalOptions>();
			await runEval(prompts, options);
		});
}

interface BrandContext {
	name?: string;
	mentionBrand?: MentionConfig["brand"];
	competitors: OnboardingCompetitor[];
}

async function runEval(positionalPrompts: string[], options: EvalOptions): Promise<void> {
	routeLibraryLogsToStderr();
	const format = parseFormat(options.format);
	const runsPerTarget = parsePositiveInt(options.runs, "runs");
	const concurrency = parsePositiveInt(options.concurrency, "concurrency");

	const loaded = await loadElmoEnv(options.dir);
	const targets = resolveTargets(options.model);

	const { prompts, brand } = await gatherInputs(positionalPrompts, options);
	if (prompts.length === 0) {
		throw new Error(
			"No prompts to evaluate. Pass them as arguments, with --prompt/--prompts-file, or via --brand-file.",
		);
	}

	if (!brand.mentionBrand && (options.brandDomain || options.alias?.length)) {
		log.warn("--brand-domain/--alias were ignored: no brand name was provided (pass --brand or --brand-file).");
	}

	const judge = brand.mentionBrand
		? {
				config: { brand: brand.mentionBrand, competitors: toMentionCompetitors(brand.competitors) },
				analyzer: createMentionAnalyzer(process.env.TYPESAFE_API_KEY, () => process.env.OPENROUTER_API_KEY),
			}
		: undefined;
	const reportCompetitors: ReportCompetitor[] = toReportCompetitors(brand.competitors);

	log.step(
		`Evaluating ${prompts.length} prompt(s) × ${targets.length} target(s) × ${runsPerTarget} run(s) = ${prompts.length * targets.length * runsPerTarget} calls…`,
	);

	interface Task {
		promptIndex: number;
		prompt: string;
		target: ResolvedTarget;
		runIndex: number;
	}
	const tasks: Task[] = [];
	for (let pi = 0; pi < prompts.length; pi++) {
		for (const target of targets) {
			for (let r = 1; r <= runsPerTarget; r++) {
				tasks.push({ promptIndex: pi, prompt: prompts[pi], target, runIndex: r });
			}
		}
	}

	let completed = 0;
	const taskResults = await mapPool(tasks, concurrency, async (task) => {
		const run = await runOne(task.prompt, task.target, task.runIndex, judge);
		completed++;
		process.stderr.write(`\r${" ".repeat(40)}\r`);
		process.stderr.write(`  ${completed}/${tasks.length} done`);
		return { task, run };
	});
	process.stderr.write("\n");

	const promptResults: EvalPromptResult[] = prompts.map((prompt, index) => {
		const targetResults: EvalTargetResult[] = targets.map((target) => {
			const runs = taskResults
				.filter((tr) => tr.task.promptIndex === index && tr.task.target.label === target.label)
				.sort((a, b) => a.task.runIndex - b.task.runIndex)
				.map((tr) => tr.run);
			return { label: target.label, model: target.config.model, provider: target.config.provider, runs };
		});

		const reportRuns: ReportPromptRun[] = targetResults.flatMap((t) =>
			t.runs
				.filter((r) => !r.error && r.brandMentioned !== null)
				.map((r) => ({
					promptId: String(index),
					brandMentioned: Boolean(r.brandMentioned),
					competitorsMentioned: r.competitorsMentioned,
				})),
		);
		const sov = reportRuns.length ? computePromptSoV(String(index), reportRuns, reportCompetitors).sovPct : null;

		return { index: index + 1, prompt, tags: [], targets: targetResults, sov };
	});

	const report = buildReport(
		promptResults,
		targets.map((t) => t.label),
		runsPerTarget,
		brand,
		reportCompetitors,
	);

	printSummary(report);

	if (!options.stdout) {
		await writeArtifacts(options.output, report, format, brand);
		log.success(
			`Wrote responses/, citations/mentions/share-of-voice/fan-out.${format}, summary.md and index.html to ${options.output}`,
		);
		log.info(`Open the report: ${path.join(options.output, "index.html")}`);
	}

	if (loaded.configDir) {
		await trackCliEvent(loaded.configDir, "cli_lab_eval", {
			prompt_count: prompts.length,
			target_count: targets.length,
			runs_per_target: runsPerTarget,
			has_brand: Boolean(judge),
			competitor_count: brand.competitors.length,
			to_stdout: Boolean(options.stdout),
			format,
		});
	}
}

async function runOne(
	prompt: string,
	target: ResolvedTarget,
	runIndex: number,
	judge: { config: MentionConfig; analyzer: MentionAnalyzer } | undefined,
): Promise<EvalRun> {
	try {
		const result = await target.provider.run(target.config.model, prompt, {
			webSearch: target.config.webSearch,
			version: target.config.version,
		});
		const extracted = extractRun(result.rawOutput, extractorFor(target.config));
		const text = extracted.textContent ?? "";
		const mentions = judge ? await judge.analyzer.analyze(text, judge.config, null, prompt) : null;
		const webQueries = dedupeFanout(result.webQueries ?? [], prompt);
		return {
			runIndex,
			responseMarkdown: text,
			brandMentioned: mentions ? mentions.brandMentioned : null,
			competitorsMentioned: mentions ? mentions.competitorsMentioned : [],
			citations: extracted.citations.map((c) => ({
				url: c.url,
				title: c.title,
				domain: c.domain,
				citationIndex: c.citationIndex,
			})),
			webQueries,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.warn(`run failed (${target.label}, run ${runIndex}): ${message}`);
		return {
			runIndex,
			responseMarkdown: "",
			brandMentioned: null,
			competitorsMentioned: [],
			citations: [],
			webQueries: [],
			error: message,
		};
	}
}

/** Drop the "unavailable" sentinel and queries that just echo the prompt verbatim. */
function dedupeFanout(queries: string[], prompt: string): string[] {
	const promptLower = prompt.trim().toLowerCase();
	const seen = new Set<string>();
	const out: string[] = [];
	for (const q of queries) {
		const norm = q.trim().toLowerCase();
		if (!norm || norm === WEB_QUERIES_UNAVAILABLE || norm === promptLower) continue;
		if (seen.has(norm)) continue;
		seen.add(norm);
		out.push(q.trim());
	}
	return out;
}

function buildReport(
	prompts: EvalPromptResult[],
	targetLabels: string[],
	runsPerTarget: number,
	brand: BrandContext,
	reportCompetitors: ReportCompetitor[],
): EvalReport {
	const allRuns: ReportPromptRun[] = prompts.flatMap((p) =>
		p.targets.flatMap((t) =>
			t.runs
				.filter((r) => !r.error && r.brandMentioned !== null)
				.map((r) => ({
					promptId: String(p.index),
					brandMentioned: Boolean(r.brandMentioned),
					competitorsMentioned: r.competitorsMentioned,
				})),
		),
	);
	const overallSov = brand.mentionBrand ? computeOverallSoV(allRuns, reportCompetitors) : null;
	const competitorSov = brand.mentionBrand
		? computeCompetitorSoVs(allRuns, reportCompetitors).map((c) => ({
				name: c.name,
				sov: c.sovPct,
				mentionCount: c.mentionCount,
			}))
		: [];

	let responses = 0;
	let citations = 0;
	let fanoutQueries = 0;
	for (const p of prompts) {
		for (const t of p.targets) {
			for (const r of t.runs) {
				if (!r.error) responses++;
				citations += r.citations.length;
				fanoutQueries += r.webQueries.length;
			}
		}
	}

	return {
		brandName: brand.name,
		generatedAt: new Date().toISOString(),
		runsPerTarget,
		targetLabels,
		prompts,
		overallSov,
		competitorSov,
		totals: { prompts: prompts.length, targets: targetLabels.length, responses, citations, fanoutQueries },
	};
}

function printSummary(report: EvalReport): void {
	const rows: Row[] = [];
	for (const p of report.prompts) {
		for (const t of p.targets) {
			const ok = t.runs.filter((r) => !r.error);
			const brandHits = ok.filter((r) => r.brandMentioned === true).length;
			const withBrand = ok.filter((r) => r.brandMentioned !== null).length;
			rows.push({
				n: pad(p.index),
				prompt: p.prompt,
				target: t.label,
				runs: ok.length,
				brand_mention_rate: withBrand ? `${Math.round((brandHits / withBrand) * 100)}%` : "",
				sov: p.sov === null ? "" : `${p.sov}%`,
				citations: ok.reduce((s, r) => s + r.citations.length, 0),
				fanout: ok.reduce((s, r) => s + r.webQueries.length, 0),
			});
		}
	}
	printStdout(toCsv(rows, ["n", "prompt", "target", "runs", "brand_mention_rate", "sov", "citations", "fanout"]));

	const fanoutLines = formatFanoutLines(report);
	if (fanoutLines) {
		printStdout(`\n# query fan-out\n${fanoutLines}`);
	}
}

function fanoutCountsByTarget(report: EvalReport): Map<string, Map<string, number>> {
	const byTarget = new Map<string, Map<string, number>>();
	for (const { t, r } of everyRun(report)) {
		const counts = byTarget.get(t.label) ?? new Map<string, number>();
		for (const q of r.webQueries) counts.set(q, (counts.get(q) ?? 0) + 1);
		if (counts.size) byTarget.set(t.label, counts);
	}
	return byTarget;
}

function formatFanoutLines(report: EvalReport): string {
	const blocks: string[] = [];
	for (const [label, counts] of fanoutCountsByTarget(report)) {
		const lines = [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([q, n]) => `  ${q}${n > 1 ? `  (×${n})` : ""}`);
		blocks.push(`# ${label}\n${lines.join("\n")}`);
	}
	return blocks.join("\n");
}

type PromptReport = EvalReport["prompts"][number];
type TargetReport = PromptReport["targets"][number];
interface RunInReport {
	p: PromptReport;
	t: TargetReport;
	r: EvalRun;
}

function everyRun(report: EvalReport): RunInReport[] {
	return report.prompts.flatMap((p) => p.targets.flatMap((t) => t.runs.map((r) => ({ p, t, r }))));
}

function responseFile({ p, t, r }: RunInReport): { dir: string; name: string; content: string } {
	const header = [
		`# ${p.prompt}`,
		"",
		`- target: \`${t.label}\``,
		`- run: ${r.runIndex}`,
		r.brandMentioned === null ? "" : `- brand mentioned: ${r.brandMentioned ? "yes" : "no"}`,
		r.competitorsMentioned.length ? `- competitors mentioned: ${r.competitorsMentioned.join(", ")}` : "",
		"",
		"---",
		"",
	]
		.filter((l) => l !== "")
		.join("\n");
	const body = r.error ? `> Run failed: ${r.error}` : r.responseMarkdown || "_(empty response)_";
	return {
		dir: `${pad(p.index)}-${slugify(p.prompt)}`,
		name: `${t.model}__${t.provider}__run-${r.runIndex}.md`,
		content: `${header}\n${body}\n`,
	};
}

function citationRowsFor({ p, t, r }: RunInReport): Row[] {
	return r.citations.map((c) => ({
		prompt_n: p.index,
		prompt: p.prompt,
		model: t.model,
		provider: t.provider,
		run: r.runIndex,
		citation_index: c.citationIndex,
		url: c.url,
		domain: c.domain,
		title: c.title ?? "",
	}));
}

function mentionRowFor({ p, t, r }: RunInReport): Row {
	return {
		prompt_n: p.index,
		prompt: p.prompt,
		model: t.model,
		provider: t.provider,
		run: r.runIndex,
		brand_mentioned: r.brandMentioned === null ? "" : r.brandMentioned,
		competitors_mentioned: r.competitorsMentioned,
		error: r.error ?? "",
	};
}

async function writeArtifacts(dir: string, report: EvalReport, format: DataFormat, brand: BrandContext): Promise<void> {
	await ensureDir(dir);

	// Clear our `responses/` tree first so a re-run (fewer runs/targets, or an
	// edited prompt that changes the slug) can't leave orphaned markdown that
	// looks like part of this run. Only our own subdir is removed; the rest of
	// the output dir (which defaults to the cwd) is left untouched.
	const responsesDir = path.join(dir, "responses");
	await fs.rm(responsesDir, { recursive: true, force: true });

	const runs = everyRun(report);
	for (const run of runs) {
		const file = responseFile(run);
		await writeText(path.join(responsesDir, file.dir), file.name, file.content);
	}
	const citationRows = runs.flatMap(citationRowsFor);
	const mentionRows = runs.map(mentionRowFor);
	const fanoutRows = runs.flatMap(({ p, t, r }) =>
		r.webQueries.map((query) => ({ prompt_n: p.index, prompt: p.prompt, model: t.model, provider: t.provider, query })),
	);
	const fullRuns: FullPromptRun[] = runs
		.filter(({ r }) => !r.error && r.brandMentioned !== null)
		.map(({ p, t, r }) => ({
			promptId: String(p.index),
			promptValue: p.prompt,
			brandMentioned: Boolean(r.brandMentioned),
			competitorsMentioned: r.competitorsMentioned,
			webQueries: r.webQueries,
			textContent: r.responseMarkdown,
			model: t.model,
		}));

	await writeStructured(
		dir,
		"citations",
		citationRows,
		["prompt_n", "prompt", "model", "provider", "run", "citation_index", "url", "domain", "title"],
		format,
	);
	await writeStructured(
		dir,
		"mentions",
		mentionRows,
		["prompt_n", "prompt", "model", "provider", "run", "brand_mentioned", "competitors_mentioned", "error"],
		format,
	);
	await writeStructured(dir, "fan-out", fanoutRows, ["prompt_n", "prompt", "model", "provider", "query"], format);

	const sovRows: Row[] = [];
	if (report.overallSov !== null)
		sovRows.push({ scope: "brand", name: report.brandName ?? "brand", sov: report.overallSov, mentions: "" });
	for (const c of report.competitorSov)
		sovRows.push({ scope: "competitor", name: c.name, sov: c.sov, mentions: c.mentionCount });
	for (const p of report.prompts)
		sovRows.push({ scope: "prompt", name: `${pad(p.index)} ${p.prompt}`, sov: p.sov ?? "", mentions: "" });
	await writeStructured(dir, "share-of-voice", sovRows, ["scope", "name", "sov", "mentions"], format);

	const contentGaps = brand.mentionBrand ? findContentGaps(fullRuns, 10) : [];
	await writeJson(dir, "run.json", {
		generatedAt: report.generatedAt,
		brandName: report.brandName,
		targets: report.targetLabels,
		runsPerTarget: report.runsPerTarget,
		totals: report.totals,
		overallSov: report.overallSov,
		competitorSov: report.competitorSov,
		contentGaps,
	});

	await writeText(dir, "summary.md", buildSummaryMarkdown(report, contentGaps));
	await writeText(dir, "index.html", buildEvalReportHtml(report));
}

function buildSummaryMarkdown(
	report: EvalReport,
	contentGaps: { promptValue: string; competitorsMentioned: string[] }[],
): string {
	const lines: string[] = [];
	lines.push(`# Elmo eval${report.brandName ? ` — ${report.brandName}` : ""}`, "");
	lines.push(`Generated ${report.generatedAt}`, "");
	lines.push(
		`- Prompts: ${report.totals.prompts}`,
		`- Targets: ${report.targetLabels.join(", ")}`,
		`- Runs per target: ${report.runsPerTarget}`,
		`- Responses: ${report.totals.responses} · Citations: ${report.totals.citations} · Fan-out queries: ${report.totals.fanoutQueries}`,
		"",
	);
	if (report.overallSov !== null) {
		lines.push(`## Share of voice`, "", `- **${report.brandName ?? "Brand"}: ${report.overallSov}%**`);
		for (const c of report.competitorSov) lines.push(`- ${c.name}: ${c.sov}% (${c.mentionCount})`);
		lines.push("");
	}
	if (contentGaps.length) {
		lines.push(`## Content gaps (competitors cited, brand absent)`, "");
		for (const g of contentGaps) lines.push(`- ${g.promptValue} — ${g.competitorsMentioned.join(", ")}`);
		lines.push("");
	}
	lines.push(`Open \`index.html\` to browse every response.`, "");
	return lines.join("\n");
}

async function gatherInputs(
	positional: string[],
	options: EvalOptions,
): Promise<{ prompts: string[]; brand: BrandContext }> {
	const explicit: string[] = [...positional];
	if (options.prompt) explicit.push(...options.prompt);
	if (options.promptsFile) explicit.push(...(await readPromptsFile(options.promptsFile)));
	// Treat a lone "-" positional as a stdin request.
	const wantsStdin = explicit.includes("-");
	const cleaned = explicit
		.filter((p) => p !== "-")
		.map((p) => p.trim())
		.filter(Boolean);
	if (wantsStdin || (cleaned.length === 0 && !options.brandFile && !process.stdin.isTTY)) {
		cleaned.push(...(await readStdinLines()));
	}

	let pack: BrandPack | undefined;
	if (options.brandFile) pack = await readBrandPack(options.brandFile);

	const prompts = dedupePrompts(cleaned.length ? cleaned : (pack?.prompts ?? []).map((p) => p.prompt));

	const brand = buildBrandContext(pack, options);
	return { prompts, brand };
}

function buildBrandContext(pack: BrandPack | undefined, options: EvalOptions): BrandContext {
	const flagCompetitors = (options.competitor ?? []).map(parseCompetitor);
	if (pack) {
		const competitors = [...pack.competitors, ...flagCompetitors];
		return {
			name: options.brand ?? pack.brandName,
			mentionBrand: toMentionBrand({
				brandName: options.brand ?? pack.brandName,
				website: options.brandDomain ?? pack.website,
				aliases: options.alias ?? pack.aliases,
				additionalDomains: pack.additionalDomains,
			}),
			competitors,
		};
	}
	if (options.brand || flagCompetitors.length) {
		return {
			name: options.brand,
			mentionBrand: options.brand
				? {
						name: options.brand,
						aliases: options.alias ?? [],
						domains: options.brandDomain ? [options.brandDomain] : [],
					}
				: undefined,
			competitors: flagCompetitors,
		};
	}
	return { competitors: [] };
}

function parseCompetitor(spec: string): OnboardingCompetitor {
	const idx = spec.indexOf(":");
	const name = (idx === -1 ? spec : spec.slice(0, idx)).trim();
	const domain = idx === -1 ? "" : spec.slice(idx + 1).trim();
	return { name, domains: domain ? [domain] : [], aliases: [] };
}

function dedupePrompts(prompts: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const p of prompts) {
		const key = p.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(p.trim());
	}
	return out;
}

async function readPromptsFile(file: string): Promise<string[]> {
	if (file === "-") return readStdinLines();
	const contents = await fs.readFile(path.resolve(process.cwd(), file), "utf8");
	return parsePromptLines(contents);
}

async function readStdinLines(): Promise<string[]> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return parsePromptLines(Buffer.concat(chunks).toString("utf8"));
}

function parsePromptLines(contents: string): string[] {
	return contents
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));
}

function parsePositiveInt(value: string, name: string): number {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 1) {
		throw new Error(`--${name} must be a positive integer (got "${value}")`);
	}
	return n;
}
