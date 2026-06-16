import { analyzeBrand } from "@workspace/lib/onboarding";
import type { Command } from "commander";
import { suggestionToBrandPack } from "../core/brand-pack.js";
import { loadElmoEnv } from "../core/env.js";
import { parseFormat, printCsv, type Row, writeJson, writeStructured } from "../core/output.js";
import { applyResearchTarget } from "../core/targets.js";
import { log, routeLibraryLogsToStderr } from "../core/ui.js";
import { trackCliEvent } from "../telemetry.js";

interface BrainstormOptions {
	count: string;
	competitors: string;
	model?: string;
	output: string;
	format: string;
	stdout?: boolean;
	dir?: string;
}

const PROMPT_COLUMNS = ["n", "type", "prompt", "tags"];
const COMPETITOR_COLUMNS = ["name", "domains", "aliases"];

export function registerBrainstorm(lab: Command): void {
	lab
		.command("brainstorm")
		.description("generate AI tracking prompts + competitors for a website")
		.argument("<website>", "website or domain to analyze (e.g. nike.com)")
		.option("-c, --count <n>", "number of prompts to generate", "30")
		.option("--competitors <n>", "number of competitors to generate", "10")
		.option("-m, --model <target>", "research provider, model:provider[:version] (direct API only)")
		.option("-o, --output <dir>", "directory to write artifacts to", ".")
		.option("--format <csv|jsonl>", "structured output format", "csv")
		.option("--stdout", "print to stdout only; do not write files")
		.action(async (website: string, _opts: object, cmd: Command) => {
			const options = cmd.optsWithGlobals<BrainstormOptions>();
			await runBrainstorm(website, options);
		});
}

async function runBrainstorm(website: string, options: BrainstormOptions): Promise<void> {
	routeLibraryLogsToStderr();
	const format = parseFormat(options.format);
	const maxPrompts = parseCount(options.count, "count");
	const maxCompetitors = parseCount(options.competitors, "competitors");

	const loaded = await loadElmoEnv(options.dir);
	applyResearchTarget(options.model);

	log.step(`Analyzing ${website} (up to ${maxPrompts} prompts, ${maxCompetitors} competitors)…`);
	const suggestion = await analyzeBrand({ website, maxPrompts, maxCompetitors });
	const pack = suggestionToBrandPack(suggestion);

	const brandLower = pack.brandName.toLowerCase();
	const promptRows: Row[] = pack.prompts.map((p, i) => ({
		n: i + 1,
		type: brandLower && p.prompt.toLowerCase().includes(brandLower) ? "branded" : "unbranded",
		prompt: p.prompt,
		tags: p.tags,
	}));
	const competitorRows: Row[] = pack.competitors.map((c) => ({
		name: c.name,
		domains: c.domains,
		aliases: c.aliases,
	}));

	// Machine-readable summary always goes to stdout.
	printCsv(promptRows, PROMPT_COLUMNS);

	if (!options.stdout) {
		const dir = options.output;
		await writeJson(dir, "brand.json", pack);
		await writeStructured(dir, "prompts", promptRows, PROMPT_COLUMNS, format);
		await writeStructured(dir, "competitors", competitorRows, COMPETITOR_COLUMNS, format);
		log.success(
			`Wrote brand.json, prompts.${format}, competitors.${format} to ${dir} (${promptRows.length} prompts, ${competitorRows.length} competitors).`,
		);
		log.info(`Pipe it into eval: elmo lab eval --brand-file ${dir.replace(/\/$/, "")}/brand.json -m <target>`);
	}

	if (loaded.configDir) {
		await trackCliEvent(loaded.configDir, "cli_lab_brainstorm", {
			prompt_count: promptRows.length,
			competitor_count: competitorRows.length,
			has_model: Boolean(options.model),
			to_stdout: Boolean(options.stdout),
			format,
		});
	}
}

function parseCount(value: string, name: string): number {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0) {
		throw new Error(`--${name} must be a non-negative integer (got "${value}")`);
	}
	return n;
}
