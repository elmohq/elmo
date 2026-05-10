#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import semver from "semver";
import { getTelemetryStatus, setTelemetryEnabled, submitNewsletterSignup, trackCliEvent } from "./telemetry.js";

// ── Types ────────────────────────────────────────────────────────────────────

type GlobalConfig = {
	configDir: string;
	dockerDir?: string;
	dev?: boolean;
	postgresMode?: PostgresMode;
	repoRoot?: string;
	updatedAt: string;
};

type ComposeService = {
	Service: string;
	State: string;
	Health?: string;
	ExitCode?: number;
};

type InitOptions = {
	dev?: boolean;
	dir?: string;
	dockerDir?: string;
};

type DirOption = {
	dir?: string;
};

type PostgresMode = "docker" | "external";

type EnvMap = Record<string, string>;

// ── Constants ────────────────────────────────────────────────────────────────

const CONFIG_HOME = path.join(os.homedir(), ".config", "elmo");
const CONFIG_FILE = path.join(CONFIG_HOME, "config.json");
const DEFAULT_APP_NAME = "Elmo";
const DEFAULT_APP_ICON = "/icons/elmo-icon.svg";
const DEFAULT_APP_URL = "http://localhost:1515";
const LOCAL_DATABASE_URL = "postgres://postgres:postgres@postgres:5432/elmo";
const TELEMETRY_DOC_URL = "https://elmohq.com/docs/developer-guide/telemetry";

// ── Banner ───────────────────────────────────────────────────────────────────

const ELMO_ASCII = [
	"",
	"      ▄▄                ",
	"      ██                ",
	"▄█▀█▄ ██ ███▄███▄ ▄███▄ ",
	"██▄█▀ ██ ██ ██ ██ ██ ██ ",
	"▀█▄▄▄ ██ ██ ██ ██ ▀███▀ ",
	"",
].join("\n");

function printBanner(): void {
	// text-blue-600 ≈ #2563EB → RGB(37, 99, 235)
	const blue = "\x1b[38;2;37;99;235m";
	const reset = "\x1b[0m";
	console.log(`${blue}${ELMO_ASCII}${reset}`);
}

// ── Logging ──────────────────────────────────────────────────────────────────

const log = {
	info: (msg: string) => p.log.info(msg),
	warn: (msg: string) => p.log.warn(msg),
	error: (msg: string) => p.log.error(msg),
	success: (msg: string) => p.log.success(msg),
	step: (msg: string) => p.log.step(msg),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function assertNotCancelled<T>(value: T | symbol): asserts value is T {
	if (p.isCancel(value)) {
		p.cancel("Setup cancelled.");
		process.exit(0);
	}
}

function generateSecret(bytes = 32): string {
	return crypto.randomBytes(bytes).toString("base64url");
}

function link(text: string, url: string): string {
	// OSC 8 hyperlink: clickable in iTerm2, Windows Terminal, GNOME Terminal, etc.
	// Falls back to plain text in unsupported terminals.
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const version = await getPackageVersion();
	const program = new Command();

	program
		.name("elmo")
		.version(version)
		.action(() => {
			printBanner();
			program.outputHelp();
		});

	program
		.command("init")
		.description("set up local Elmo instance")
		.option("--dev", "Use local build context (repo only)")
		.option("--dir <path>", "Directory to store config files")
		.option("--docker-dir <path>", "Path to Docker build context (dev mode)")
		.action(async (options: InitOptions) => {
			await withVersionCheck(version, () => runInit(options, version));
		});

	program
		.command("regen")
		.description("regenerate configuration files from current settings")
		.option("--dir <path>", "Config directory")
		.action(async (options: DirOption) => {
			await withVersionCheck(version, () => runRegen(options));
		});

	program
		.command("start")
		.description("start Elmo instance")
		.option("--dir <path>", "Config directory")
		.action(async (options: DirOption) => {
			await withVersionCheck(version, () => runStart(options));
		});

	program
		.command("stop")
		.description("stop Elmo instance")
		.option("--dir <path>", "Config directory")
		.action(async (options: DirOption) => {
			await withVersionCheck(version, () => runStop(options));
		});

	program
		.command("status")
		.description("check Elmo instance health")
		.option("--dir <path>", "Config directory")
		.action(async (options: DirOption) => {
			await withVersionCheck(version, () => runStatus(options));
		});

	program
		.command("compose")
		.description("run Docker Compose commands using your Elmo config")
		.allowUnknownOption(true)
		.option("--dir <path>", "Config directory")
		.argument("[args...]", "Arguments passed to Docker Compose")
		.action(async (args: string[], options: DirOption) => {
			await withVersionCheck(version, () => runCompose(args, options));
		});

	program
		.command("logs")
		.description("view Elmo instance logs")
		.allowUnknownOption(true)
		.option("--dir <path>", "Config directory")
		.argument("[args...]", "Arguments passed to Docker Compose logs")
		.action(async (args: string[], options: DirOption) => {
			await withVersionCheck(version, () => runCompose(["logs", ...args], options));
		});

	program
		.command("build")
		.description("build Docker images locally for development")
		.option("--dir <path>", "Config directory")
		.option("--web-only", "Only build the web image")
		.option("--worker-only", "Only build the worker image")
		.option("--no-cache", "Build without Docker cache")
		.action(
			async (
				options: DirOption & {
					webOnly?: boolean;
					workerOnly?: boolean;
					cache?: boolean;
				},
			) => {
				await withVersionCheck(version, () => runBuild(options));
			},
		);

	const telemetry = program.command("telemetry").description("manage CLI + local-deployment telemetry");

	telemetry
		.command("status")
		.description("show whether telemetry is enabled and what is collected")
		.action(async () => {
			await runTelemetryStatus();
		});

	telemetry
		.command("enable")
		.description("enable telemetry")
		.action(async () => {
			await setTelemetryEnabled(true);
			const updated = await updateDeploymentEnvTelemetry(true);
			log.success("Telemetry enabled.");
			if (updated) {
				log.info(`Updated ${updated}. Restart the stack with \`elmo start\` to apply.`);
			}
			console.log(`  Details: ${link(pc.cyan(TELEMETRY_DOC_URL), TELEMETRY_DOC_URL)}`);
		});

	telemetry
		.command("disable")
		.description("disable telemetry")
		.action(async () => {
			await setTelemetryEnabled(false);
			const updated = await updateDeploymentEnvTelemetry(false);
			log.success("Telemetry disabled. No further events will be sent.");
			if (updated) {
				log.info(`Updated ${updated}. Restart the stack with \`elmo start\` to apply.`);
			}
		});

	await program.parseAsync(process.argv);
}

async function runTelemetryStatus(): Promise<void> {
	const status = await getTelemetryStatus();
	const state = status.enabled ? pc.green("enabled") : pc.yellow("disabled");
	console.log(`Telemetry: ${state}`);
	if (status.source === "env") {
		console.log("  Source: DISABLE_TELEMETRY environment variable");
	} else if (status.source === "config") {
		console.log(`  Source: ${CONFIG_FILE}`);
	}
	if (status.distinctId) {
		console.log(`  Install ID: ${status.distinctId}`);
	}
	console.log(`  What we collect: ${link(pc.cyan(TELEMETRY_DOC_URL), TELEMETRY_DOC_URL)}`);
	console.log("  Toggle: `elmo telemetry enable` / `elmo telemetry disable`");
}

async function withVersionCheck(version: string, fn: () => Promise<void>): Promise<void> {
	const notifyPromise = maybeNotifyNewVersion(version);
	await fn();
	await notifyPromise.catch(() => undefined);
}

// ── Command: init ────────────────────────────────────────────────────────────

async function runInit(options: InitOptions, version: string): Promise<void> {
	printBanner();
	p.intro(pc.bold("Setting up Elmo"));

	const cwd = process.cwd();

	// ── Resolve config directory ─────────────────────────────────────────
	let configDir: string;
	if (options.dir) {
		configDir = path.resolve(cwd, options.dir);
	} else {
		const dir = await p.text({
			message: "Where should the config be stored?",
			placeholder: "./elmo",
			defaultValue: "./elmo",
		});
		assertNotCancelled(dir);
		configDir = path.resolve(cwd, dir);
	}

	// ── .env safety check ────────────────────────────────────────────────
	const existingEnvPath = path.join(configDir, ".env");
	if (await fileExists(existingEnvPath)) {
		const contents = await fs.readFile(existingEnvPath, "utf8");
		const isElmoEnv = contents.startsWith("# Generated by elmo");

		if (!isElmoEnv) {
			p.log.warn(`A .env file already exists in ${configDir} and was NOT created by Elmo.`);
			const overwrite = await p.confirm({
				message: "Overwrite the existing .env file? This cannot be undone.",
				initialValue: false,
			});
			assertNotCancelled(overwrite);
			if (!overwrite) {
				p.cancel("Setup cancelled. Choose a different directory with --dir.");
				process.exit(0);
			}
		} else {
			p.log.info("Existing Elmo config found — it will be updated.");
		}
	}

	// ── Dev mode: resolve docker directory ───────────────────────────────
	let dockerDir: string | undefined;
	let repoRoot: string;

	if (options.dev) {
		if (options.dockerDir) {
			dockerDir = path.resolve(cwd, options.dockerDir);
			if (!(await fileExists(path.join(dockerDir, "Dockerfile")))) {
				p.log.error(`Dockerfile not found in ${dockerDir}`);
				process.exit(1);
			}
		} else {
			dockerDir = await resolveDockerDirInteractive(cwd);
		}
		repoRoot = path.resolve(dockerDir, "..");
	} else {
		repoRoot = cwd;
	}

	// ── Data stores ──────────────────────────────────────────────────────
	const postgresMode = await p.select({
		message: "PostgreSQL connection",
		options: [
			{
				value: "docker" as const,
				label: "Run Postgres in Docker",
			},
			{
				value: "external" as const,
				label: "Use existing Postgres (provide DATABASE_URL)",
			},
		],
		initialValue: "docker" as PostgresMode,
	});
	assertNotCancelled(postgresMode);

	const env: EnvMap = {};
	env.DEPLOYMENT_MODE = "local";
	env.VITE_DEPLOYMENT_MODE = "local";
	env.DEPLOYMENT_ID = crypto.randomUUID();
	env.BETTER_AUTH_SECRET = generateSecret();
	env.APP_NAME = DEFAULT_APP_NAME;
	env.APP_ICON = DEFAULT_APP_ICON;
	env.APP_URL = DEFAULT_APP_URL;
	env.VITE_APP_NAME = DEFAULT_APP_NAME;
	env.VITE_APP_ICON = DEFAULT_APP_ICON;
	env.VITE_APP_URL = DEFAULT_APP_URL;

	if (postgresMode === "external") {
		p.note("Must be an IPv4-compatible direct connection or database pooler.", "DATABASE_URL");
		const url = await p.password({
			message: "DATABASE_URL",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(url);
		env.DATABASE_URL = url;
	} else {
		env.DATABASE_URL = LOCAL_DATABASE_URL;
	}

	// ── AI providers ─────────────────────────────────────────────────────
	const setupMode = await configureProvidersInteractive(env);

	// ── Telemetry ───────────────────────────────────────────────────────
	p.note(
		[
			"Elmo is open source and maintained by a small team. Telemetry",
			"from both the CLI and your local deployment (web + worker)",
			"tells us things like which CLI versions are still in use, where",
			"`elmo init` drops off, which providers people pick, and whether",
			"new features actually get used. Without it we are flying blind",
			"on what to fix or build next.",
			"",
			pc.bold("What we send:"),
			"  • install ID (random UUID stored in ~/.config/elmo/config.json)",
			"  • CLI/app version, OS, arch, Node version, deployment mode",
			"  • command/event names + non-secret options (e.g. postgres mode)",
			"  • feature counts (prompts edited, brands created — never the names or text)",
			"  • IP address (recorded on each event by PostHog, used for geolocation)",
			"",
			pc.bold("What we never send:"),
			"  API keys, .env contents, brand names, prompt text, and scraped responses.",
			"",
			`Full breakdown: ${link(pc.cyan(TELEMETRY_DOC_URL), TELEMETRY_DOC_URL)}`,
			"Toggle later with `elmo telemetry enable|disable`.",
		].join("\n"),
		"Telemetry",
	);

	const telemetryEnabled = await p.confirm({
		message: "Share telemetry?",
		initialValue: true,
	});
	assertNotCancelled(telemetryEnabled);
	await setTelemetryEnabled(telemetryEnabled);
	if (!telemetryEnabled) {
		env.DISABLE_TELEMETRY = "1";
	}

	// ── Product updates ─────────────────────────────────────────────────
	const updatesEmail = await p.text({
		message: "Enter your work email to receive product updates (optional)",
		placeholder: "you@example.com",
	});
	const email = p.isCancel(updatesEmail) ? undefined : updatesEmail || undefined;

	// ── Write config ─────────────────────────────────────────────────────
	const composeYaml = buildComposeYaml({
		dev: Boolean(options.dev),
		postgresMode,
		repoRoot,
		dockerDir,
	});

	await ensureDir(configDir);
	await writeConfigFiles(configDir, {
		env,
		composeYaml,
		postgresMode,
		dev: Boolean(options.dev),
	});
	await writeGlobalConfig({
		configDir,
		dockerDir,
		dev: Boolean(options.dev),
		postgresMode,
		repoRoot,
	});

	p.log.success(`Config written to ${configDir}`);
	p.log.warn("Your generated .env file contains secrets — do not commit it to version control.");

	if (options.dev) {
		p.log.info("Dev mode enabled. Run `elmo compose build` before starting.");
	}

	const shouldStart = await p.confirm({
		message: "Start the stack now?",
		initialValue: true,
	});
	assertNotCancelled(shouldStart);

	if (shouldStart) {
		await doStart(configDir);
	} else {
		p.log.info("You can start later with `elmo start`.");
	}

	// CLI telemetry — silently dropped if the user opted out above.
	await trackCliEvent("cli_init", {
		version,
		os: process.platform,
		arch: process.arch,
		node_version: process.version,
		postgres_mode: postgresMode,
		dev_mode: Boolean(options.dev),
		setup_mode: setupMode,
		has_scraper: Boolean(env.BRIGHTDATA_API_TOKEN || env.OLOSTEP_API_KEY),
		has_direct_api: hasDirectApiConfigured(env),
	});

	// Newsletter signup is a separate, explicit opt-in and runs even when
	// telemetry is disabled.
	if (email) {
		await submitNewsletterSignup(email);
	}

	p.log.message(
		`If you find Elmo useful, star us on GitHub!\n  ${link(pc.cyan("https://github.com/elmohq/elmo"), "https://github.com/elmohq/elmo")}`,
	);

	p.outro(pc.green("Setup complete!"));
}

// ── Provider Configuration ───────────────────────────────────────────────────

const BRIGHTDATA_AFFILIATE = "https://get.brightdata.com/67h1b7h0shcn";
const OLOSTEP_AFFILIATE = "https://olostep.com/?ref=elmo";
const PROVIDERS_DOC_URL = "https://docs.elmohq.com/docs/user-guide/providers";

// Surfaces each scraper can track — the first two are the "recommended starter" set.
const BRIGHTDATA_MODELS = ["chatgpt", "google-ai-mode", "perplexity", "copilot", "gemini", "grok"] as const;

const OLOSTEP_MODELS = [
	"chatgpt",
	"google-ai-mode",
	"google-ai-overview",
	"perplexity",
	"copilot",
	"gemini",
	"grok",
] as const;

const DEFAULT_SCRAPER_MODELS = ["chatgpt", "google-ai-mode"] as const;

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6";
const DEFAULT_MISTRAL_MODEL = "mistral-medium-latest";

async function configureProvidersInteractive(env: EnvMap): Promise<"recommended" | "custom"> {
	p.note(
		[
			"Elmo needs two kinds of providers:",
			"",
			pc.bold("1. A scraper") + " — to track ChatGPT and Google AI Mode (no public APIs):",
			`     • ${pc.cyan("BrightData")} — cheap solid option, ~$0.45/mo per prompt`,
			`     • ${pc.cyan("Olostep")}    — premium option, powers Peec/AirOps, ~$2.25/mo per prompt`,
			"",
			pc.bold("2. A direct LLM API") + " — for low-latency tasks (onboarding analysis, sentiment scoring,",
			"   ad-hoc LLM calls). Required:",
			`     • ${pc.cyan("OpenRouter")} — one key, all major models (recommended)`,
			`     • ${pc.cyan("Anthropic / OpenAI / Mistral")} — direct provider keys`,
			"",
			"Pricing assumes Elmo's default cadence (5 runs/day × 2 surfaces).",
		].join("\n"),
		"AI providers",
	);

	const mode = await p.select({
		message: "Setup mode",
		options: [
			{ value: "recommended" as const, label: "Recommended — one scraper + one direct API (4 prompts)" },
			{ value: "custom" as const, label: "Custom — pick each provider individually" },
		],
		initialValue: "recommended" as const,
	});
	assertNotCancelled(mode);

	if (mode === "recommended") {
		await configureProvidersRecommended(env);
	} else {
		await configureProvidersCustom(env);
	}
	return mode;
}

async function configureProvidersRecommended(env: EnvMap): Promise<void> {
	const targets: string[] = [];

	// ── Scraper ─────────────────────────────────────────────────────────────
	const scraper = await p.select({
		message: "Scraper (tracks ChatGPT + Google AI Mode)",
		options: [
			{ value: "brightdata" as const, label: "BrightData — ~$0.45/mo per prompt (cheaper)" },
			{ value: "olostep" as const, label: "Olostep — ~$2.25/mo per prompt (premium)" },
		],
		initialValue: "brightdata" as const,
	});
	assertNotCancelled(scraper);
	await collectScraperKey(scraper, env);
	for (const model of DEFAULT_SCRAPER_MODELS) {
		targets.push(`${model}:${scraper}:online`);
	}

	// ── Direct API ──────────────────────────────────────────────────────────
	const direct = await p.select({
		message: "Direct LLM API (powers onboarding analysis + sentiment scoring)",
		options: [
			{ value: "openrouter" as const, label: "OpenRouter — one key, all major models (recommended)" },
			{ value: "anthropic" as const, label: "Anthropic — direct Claude" },
			{ value: "openai" as const, label: "OpenAI — direct GPT-* models" },
			{ value: "mistral" as const, label: "Mistral — direct Mistral models" },
		],
		initialValue: "openrouter" as const,
	});
	assertNotCancelled(direct);
	await collectDirectApiQuick(direct, env, targets);

	await finalizeScrapeTargets(env, targets, { skipEdit: true });
}

async function configureProvidersCustom(env: EnvMap): Promise<void> {
	const targets: string[] = [];

	p.log.step(pc.bold("Step 1 of 2 — Direct LLM API (at least one is required)"));
	// Order matches the auto-pick preference in onboarding/llm.ts so the first
	// provider asked is the one onboarding will reach for by default.
	while (!hasDirectApiConfigured(env)) {
		await collectOpenRouter(env, targets);
		await collectAnthropic(env, targets);
		await collectOpenAI(env, targets);
		await collectMistral(env, targets);
		if (!hasDirectApiConfigured(env)) {
			p.log.warn(
				"Onboarding analysis and other low-latency LLM tasks require a direct API. Configure at least one before continuing.",
			);
		}
	}

	p.log.step(pc.bold("Step 2 of 2 — Scrapers (optional, but needed to track ChatGPT / Google AI Mode)"));
	await collectBrightData(env, targets);
	await collectOlostep(env, targets);
	await collectDataForSEO(env, targets);

	await finalizeScrapeTargets(env, targets);
}

function hasDirectApiConfigured(env: EnvMap): boolean {
	return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.MISTRAL_API_KEY || env.OPENROUTER_API_KEY);
}

async function collectScraperKey(scraper: "brightdata" | "olostep", env: EnvMap): Promise<void> {
	if (scraper === "brightdata") {
		p.log.info(`Sign up: ${link(pc.cyan(BRIGHTDATA_AFFILIATE), BRIGHTDATA_AFFILIATE)}`);
		const key = await p.password({
			message: "BrightData API token",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.BRIGHTDATA_API_TOKEN = key;
	} else {
		p.log.info(`Sign up: ${link(pc.cyan(OLOSTEP_AFFILIATE), OLOSTEP_AFFILIATE)}`);
		const key = await p.password({
			message: "Olostep API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.OLOSTEP_API_KEY = key;
	}
}

async function collectDirectApiQuick(
	kind: "openrouter" | "anthropic" | "openai" | "mistral",
	env: EnvMap,
	targets: string[],
): Promise<void> {
	if (kind === "openrouter") {
		const key = await p.password({
			message: "OpenRouter API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.OPENROUTER_API_KEY = key;
		targets.push(`claude:openrouter:${DEFAULT_OPENROUTER_MODEL}:online`);
	} else if (kind === "anthropic") {
		const key = await p.password({
			message: "Anthropic API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.ANTHROPIC_API_KEY = key;
		targets.push(`claude:anthropic-api:${DEFAULT_ANTHROPIC_MODEL}:online`);
	} else if (kind === "openai") {
		const key = await p.password({
			message: "OpenAI API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.OPENAI_API_KEY = key;
		targets.push(`chatgpt:openai-api:${DEFAULT_OPENAI_MODEL}:online`);
	} else {
		const key = await p.password({
			message: "Mistral API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.MISTRAL_API_KEY = key;
		targets.push(`mistral:mistral-api:${DEFAULT_MISTRAL_MODEL}:online`);
	}
}

async function collectBrightData(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("BrightData")}? (~$0.45/mo per prompt)`,
		initialValue: true,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	p.log.info(`Sign up and generate an API token: ${link(pc.cyan(BRIGHTDATA_AFFILIATE), BRIGHTDATA_AFFILIATE)}`);
	const key = await p.password({
		message: "BrightData API token",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(key);
	env.BRIGHTDATA_API_TOKEN = key;

	await pickScraperTargets({
		providerLabel: "BrightData",
		providerId: "brightdata",
		allModels: BRIGHTDATA_MODELS as readonly string[],
		targets,
	});
}

async function collectOlostep(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("Olostep")}? (~$2.25/mo per prompt)`,
		initialValue: false,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	p.log.info(`Grab an API key: ${link(pc.cyan(OLOSTEP_AFFILIATE), OLOSTEP_AFFILIATE)}`);
	const key = await p.password({
		message: "Olostep API key",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(key);
	env.OLOSTEP_API_KEY = key;

	await pickScraperTargets({
		providerLabel: "Olostep",
		providerId: "olostep",
		allModels: OLOSTEP_MODELS as readonly string[],
		targets,
	});
}

async function pickScraperTargets(args: {
	providerLabel: string;
	providerId: "brightdata" | "olostep";
	allModels: readonly string[];
	targets: string[];
}): Promise<void> {
	const selected = (await p.multiselect({
		message: `Surfaces to track via ${args.providerLabel}`,
		options: args.allModels.map((model) => ({ value: model, label: model })),
		required: true,
		initialValues: [...DEFAULT_SCRAPER_MODELS],
	})) as string[] | symbol;
	assertNotCancelled(selected);

	for (const model of selected) {
		args.targets.push(`${model}:${args.providerId}:online`);
	}
}

async function collectAnthropic(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("Anthropic API")}? (direct Claude — ~$4–5/mo per prompt per model)`,
		initialValue: false,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	const key = await p.password({
		message: "Anthropic API key",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(key);
	env.ANTHROPIC_API_KEY = key;

	const model = await p.text({
		message: "Claude model",
		placeholder: DEFAULT_ANTHROPIC_MODEL,
		defaultValue: DEFAULT_ANTHROPIC_MODEL,
	});
	assertNotCancelled(model);
	const slug = model || DEFAULT_ANTHROPIC_MODEL;

	const webSearch = await p.confirm({
		message: "Enable Claude's web search tool? (reflects real browsing behavior)",
		initialValue: true,
	});
	assertNotCancelled(webSearch);

	targets.push(webSearch ? `claude:anthropic-api:${slug}:online` : `claude:anthropic-api:${slug}`);
}

async function collectOpenAI(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("OpenAI API")}? (gpt-* with web search — not the real ChatGPT UI)`,
		initialValue: false,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	const key = await p.password({
		message: "OpenAI API key",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(key);
	env.OPENAI_API_KEY = key;

	const model = await p.text({
		message: "OpenAI model",
		placeholder: DEFAULT_OPENAI_MODEL,
		defaultValue: DEFAULT_OPENAI_MODEL,
	});
	assertNotCancelled(model);
	const slug = model || DEFAULT_OPENAI_MODEL;

	const webSearch = await p.confirm({
		message: "Enable the web_search_preview tool?",
		initialValue: true,
	});
	assertNotCancelled(webSearch);

	targets.push(webSearch ? `chatgpt:openai-api:${slug}:online` : `chatgpt:openai-api:${slug}`);
}

async function collectMistral(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("Mistral API")}? (direct Mistral models)`,
		initialValue: false,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	const key = await p.password({
		message: "Mistral API key",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(key);
	env.MISTRAL_API_KEY = key;

	const model = await p.text({
		message: "Mistral model",
		placeholder: DEFAULT_MISTRAL_MODEL,
		defaultValue: DEFAULT_MISTRAL_MODEL,
	});
	assertNotCancelled(model);
	const slug = model || DEFAULT_MISTRAL_MODEL;

	const webSearch = await p.confirm({
		message: "Enable Mistral's web search tool? (uses the beta Conversations API)",
		initialValue: true,
	});
	assertNotCancelled(webSearch);

	targets.push(webSearch ? `mistral:mistral-api:${slug}:online` : `mistral:mistral-api:${slug}`);
}

async function collectOpenRouter(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("OpenRouter")}? (one key, many hosted models)`,
		initialValue: false,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	const key = await p.password({
		message: "OpenRouter API key",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(key);
	env.OPENROUTER_API_KEY = key;

	const model = await p.text({
		message: "OpenRouter model slug",
		placeholder: DEFAULT_OPENROUTER_MODEL,
		defaultValue: DEFAULT_OPENROUTER_MODEL,
	});
	assertNotCancelled(model);
	const slug = model || DEFAULT_OPENROUTER_MODEL;

	const webSearch = await p.confirm({
		message: "Append :online for web search?",
		initialValue: true,
	});
	assertNotCancelled(webSearch);

	targets.push(webSearch ? `claude:openrouter:${slug}:online` : `claude:openrouter:${slug}`);
}

async function collectDataForSEO(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("DataForSEO")}? (Google AI Mode scraping + keyword/persona suggestions in the web wizard)`,
		initialValue: false,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	const login = await p.text({
		message: "DataForSEO login",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(login);
	env.DATAFORSEO_LOGIN = login;

	const pwd = await p.password({
		message: "DataForSEO password",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(pwd);
	env.DATAFORSEO_PASSWORD = pwd;

	const addTarget = await p.confirm({
		message: "Also scrape Google AI Mode via DataForSEO? (google-ai-mode:dataforseo:online)",
		initialValue: false,
	});
	assertNotCancelled(addTarget);
	if (addTarget) {
		targets.push("google-ai-mode:dataforseo:online");
	}
}

async function finalizeScrapeTargets(
	env: EnvMap,
	targets: string[],
	options: { skipEdit?: boolean } = {},
): Promise<void> {
	const deduped = dedupeTargets(targets);

	if (!deduped) {
		p.log.warn("No SCRAPE_TARGETS configured. Elmo will not run scheduled checks until you set them.");
		p.log.info(`Reference: ${link(pc.cyan(PROVIDERS_DOC_URL), PROVIDERS_DOC_URL)}`);

		const addManual = await p.confirm({
			message: "Enter SCRAPE_TARGETS manually now?",
			initialValue: false,
		});
		assertNotCancelled(addManual);
		if (addManual) {
			const manual = await p.text({
				message: "SCRAPE_TARGETS (model:provider[:version][:online], comma-separated)",
				placeholder: "chatgpt:brightdata:online,google-ai-mode:brightdata:online",
				validate: (v) => (!v ? "Required" : undefined),
			});
			assertNotCancelled(manual);
			env.SCRAPE_TARGETS = manual;
		}
		return;
	}

	if (options.skipEdit) {
		env.SCRAPE_TARGETS = deduped;
		return;
	}

	const customize = await p.confirm({
		message: "Edit SCRAPE_TARGETS before saving?",
		initialValue: false,
	});
	assertNotCancelled(customize);

	if (customize) {
		p.log.info(`Reference: ${link(pc.cyan(PROVIDERS_DOC_URL), PROVIDERS_DOC_URL)}`);
		const manual = await p.text({
			message: "SCRAPE_TARGETS",
			initialValue: deduped,
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(manual);
		env.SCRAPE_TARGETS = manual;
		p.log.step(`SCRAPE_TARGETS:\n  ${pc.cyan(manual)}`);
	} else {
		env.SCRAPE_TARGETS = deduped;
	}
}

function dedupeTargets(targets: string[]): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of targets) {
		if (seen.has(t)) continue;
		seen.add(t);
		out.push(t);
	}
	return out.join(",");
}

// ── Command: update ──────────────────────────────────────────────────────────

async function runRegen(options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	const globalConfig = await readGlobalConfig();

	// Determine settings: prefer global config, fall back to detecting from files
	let dev: boolean;
	let postgresMode: PostgresMode;
	let repoRoot: string;
	let dockerDir: string | undefined;

	if (globalConfig?.postgresMode) {
		dev = globalConfig.dev ?? false;
		postgresMode = globalConfig.postgresMode;
		repoRoot = globalConfig.repoRoot ?? process.cwd();
		dockerDir = globalConfig.dockerDir;
	} else {
		const detected = await detectSettingsFromConfig(configDir);
		dev = detected.dev;
		postgresMode = detected.postgresMode;
		repoRoot = detected.repoRoot;
		dockerDir = detected.dockerDir;
	}

	const composeYaml = buildComposeYaml({
		dev,
		postgresMode,
		repoRoot,
		dockerDir,
	});

	const composePath = path.join(configDir, "elmo.yaml");
	await fs.writeFile(composePath, composeYaml, "utf8");

	await writeGlobalConfig({
		configDir,
		dockerDir,
		dev,
		postgresMode,
		repoRoot,
	});

	log.success(`Regenerated ${composePath}`);
	log.info("The .env file was not modified.");
}

// ── Command: start ───────────────────────────────────────────────────────────

async function runStart(options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	await doStart(configDir);
}

async function doStart(configDir: string): Promise<void> {
	assertDockerRunning();

	log.step("Starting Docker Compose stack...");
	await runDockerCompose(configDir, ["up", "-d"]);

	const s = p.spinner();
	s.start("Waiting for services to become healthy...");
	const ok = await waitForHealthy(configDir, 180_000);
	if (ok) {
		s.stop("All services healthy!");
	} else {
		s.stop("Health check timed out.");
		p.log.warn("Some services did not report healthy status.");
	}

	log.info("Examples:");
	console.log(`  ${pc.bold("elmo logs -f")}`);
	console.log(`  ${pc.bold("elmo compose logs -f web")}`);
	console.log(`  ${pc.bold("elmo compose ps")}`);
}

// ── Command: stop ────────────────────────────────────────────────────────────

async function runStop(options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	assertDockerRunning();

	log.step("Stopping Docker Compose stack...");
	await runDockerCompose(configDir, ["down"]);
	log.success("Stack stopped.");
}

// ── Command: status ──────────────────────────────────────────────────────────

async function runStatus(options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	assertDockerRunning();

	const services = await getComposeServices(configDir);
	if (services.length === 0) {
		log.warn("No running services found.");
		return;
	}

	let allHealthy = true;
	for (const service of services) {
		const status = formatServiceStatus(service);
		console.log(status);
		if (!isServiceReady(service)) {
			allHealthy = false;
		}
	}

	if (allHealthy) {
		log.success("All services are healthy.");
	} else {
		log.warn("Some services are not healthy yet.");
	}
}

// ── Command: compose ─────────────────────────────────────────────────────────

async function runCompose(args: string[], options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	assertDockerRunning();
	await runDockerCompose(configDir, args);
}

// ── Command: build ───────────────────────────────────────────────────────────

async function runBuild(
	options: DirOption & {
		webOnly?: boolean;
		workerOnly?: boolean;
		cache?: boolean;
	},
): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	assertDockerRunning();

	const buildWeb = !options.workerOnly;
	const buildWorker = !options.webOnly;
	const noCache = options.cache === false;

	const targets: string[] = [];
	if (buildWeb) targets.push("web");
	if (buildWorker) targets.push("worker");

	log.step(`Building Docker images: ${targets.join(", ")}${noCache ? " (no cache)" : ""}...`);

	const buildArgs: string[] = ["build"];
	if (noCache) buildArgs.push("--no-cache");

	for (const target of targets) {
		log.step(`Building ${target}...`);
		await runDockerCompose(configDir, [...buildArgs, target]);
		log.success(`${target} image built successfully.`);
	}

	log.success("All images built.");
	console.log(`  Run ${pc.bold("elmo start")} to start the stack.`);
}

// ── Compose YAML Builder ─────────────────────────────────────────────────────

function buildComposeYaml(options: {
	dev: boolean;
	postgresMode: PostgresMode;
	repoRoot: string;
	dockerDir?: string;
}): string {
	const services: string[] = [];
	const volumes = new Set<string>();

	const dependsOnWeb: string[] = [];
	const dependsOnWorker: string[] = [];

	const dependencyConditions: Record<string, string> = {
		postgres: "service_healthy",
		"db-migrate": "service_completed_successfully",
	};

	const dockerfilePath = options.dockerDir
		? path.relative(options.repoRoot, path.join(options.dockerDir, "Dockerfile"))
		: "docker/Dockerfile";

	if (options.postgresMode === "docker") {
		services.push(buildPostgresService());
		services.push(
			buildDbMigrateService({
				dev: options.dev,
				dockerfilePath,
				repoRoot: options.repoRoot,
			}),
		);
		dependsOnWeb.push("db-migrate");
		dependsOnWorker.push("db-migrate");
		volumes.add("postgres_data");
	}

	services.push(
		buildWebService({
			dev: options.dev,
			dependsOn: dependsOnWeb,
			dependencyConditions,
			repoRoot: options.repoRoot,
			dockerfilePath,
		}),
	);
	services.push(
		buildWorkerService({
			dev: options.dev,
			dependsOn: dependsOnWorker,
			dependencyConditions,
			repoRoot: options.repoRoot,
			dockerfilePath,
		}),
	);

	const lines = ["name: elmo", "", "services:"];
	lines.push(...services.map((service) => indentBlock(service, 2)));

	if (volumes.size > 0) {
		lines.push("", "volumes:");
		for (const volume of volumes) {
			lines.push(`  ${volume}:`);
		}
	}

	return `${lines.join("\n")}\n`;
}

function buildPostgresService(): string {
	return [
		"postgres:",
		"  image: postgres:16-alpine",
		"  environment:",
		"    POSTGRES_USER: postgres",
		"    POSTGRES_PASSWORD: postgres",
		"    POSTGRES_DB: elmo",
		"  volumes:",
		"    - postgres_data:/var/lib/postgresql/data",
		"  ports:",
		'    - "5432:5432"',
		"  healthcheck:",
		'    test: ["CMD-SHELL", "pg_isready -U postgres"]',
		"    interval: 5s",
		"    timeout: 5s",
		"    retries: 5",
		"    start_period: 30s",
	].join("\n");
}

function buildDbMigrateService(options: { dev: boolean; dockerfilePath: string; repoRoot: string }): string {
	const lines = ["db-migrate:"];
	if (options.dev) {
		lines.push(
			"  build:",
			`    context: ${options.repoRoot}`,
			`    dockerfile: ${options.dockerfilePath}`,
			"    target: migrate",
		);
	} else {
		lines.push("  image: elmohq/elmo-db-migrate:latest");
	}

	lines.push(
		"  environment:",
		"    - DATABASE_URL=postgres://postgres:postgres@postgres:5432/elmo",
		"  depends_on:",
		"    postgres:",
		"      condition: service_healthy",
	);

	return lines.join("\n");
}

function buildWebService(options: {
	dev: boolean;
	dependsOn: string[];
	dependencyConditions: Record<string, string>;
	repoRoot: string;
	dockerfilePath: string;
}): string {
	const lines = ["web:"];
	if (options.dev) {
		lines.push(
			"  build:",
			`    context: ${options.repoRoot}`,
			`    dockerfile: ${options.dockerfilePath}`,
			"    target: web",
			"    args:",
			"      DEPLOYMENT_MODE: local",
		);
	} else {
		lines.push("  image: elmohq/elmo-web:latest");
	}

	lines.push("  env_file:", "    - path: .env", "      required: true", "  ports:", '    - "1515:3000"');

	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition = options.dependencyConditions[service] ?? "service_started";
			lines.push(`    ${service}:`, `      condition: ${condition}`);
		}
	}

	return lines.join("\n");
}

function buildWorkerService(options: {
	dev: boolean;
	dependsOn: string[];
	dependencyConditions: Record<string, string>;
	repoRoot: string;
	dockerfilePath: string;
}): string {
	const lines = ["worker:"];
	if (options.dev) {
		lines.push(
			"  build:",
			`    context: ${options.repoRoot}`,
			`    dockerfile: ${options.dockerfilePath}`,
			"    target: worker",
			"    args:",
			"      DEPLOYMENT_MODE: local",
		);
	} else {
		lines.push("  image: elmohq/elmo-worker:latest");
	}

	lines.push("  env_file:", "    - path: .env", "      required: true");

	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition = options.dependencyConditions[service] ?? "service_started";
			lines.push(`    ${service}:`, `      condition: ${condition}`);
		}
	}

	return lines.join("\n");
}

function indentBlock(block: string, spaces: number): string {
	const indent = " ".repeat(spaces);
	return block
		.split("\n")
		.map((line) => `${indent}${line}`)
		.join("\n");
}

// ── Docker Helpers ───────────────────────────────────────────────────────────

async function getComposeServices(configDir: string): Promise<ComposeService[]> {
	const output = await runDockerComposeCapture(configDir, ["ps", "--format", "json"]);
	if (!output.trim()) {
		return [];
	}
	try {
		const trimmed = output.trim();
		const parsed = JSON.parse(trimmed);
		if (Array.isArray(parsed)) {
			return parsed as ComposeService[];
		}
		if (typeof parsed === "object" && parsed !== null) {
			return [parsed as ComposeService];
		}
		return [];
	} catch {
		try {
			return output
				.trim()
				.split("\n")
				.filter((line) => line.trim())
				.map((line) => JSON.parse(line) as ComposeService);
		} catch {
			log.warn("Unable to parse docker compose status.");
			return [];
		}
	}
}

function formatServiceStatus(service: ComposeService): string {
	const health = service.Health ?? "unknown";
	const state = service.State ?? "unknown";
	const label = `${service.Service}`.padEnd(16, " ");
	let color = pc.red;

	if (isServiceReady(service)) {
		color = pc.green;
	} else if (health === "starting" || state.includes("starting")) {
		color = pc.yellow;
	}

	return color(`${label} ${state} ${service.Health ? `(${health})` : ""}`.trim());
}

function isServiceReady(service: ComposeService): boolean {
	if (service.Health) {
		return service.Health === "healthy";
	}
	if (service.State?.startsWith("running")) {
		return true;
	}
	return false;
}

async function waitForHealthy(configDir: string, timeoutMs: number): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const services = await getComposeServices(configDir);
		if (services.length > 0 && services.every(isServiceReady)) {
			return true;
		}
		await sleep(3000);
	}
	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function runDockerCompose(configDir: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const composeFile = path.join(configDir, "elmo.yaml");
		const commandArgs = ["compose", "-f", composeFile, ...args];
		const child = spawn("docker", commandArgs, {
			stdio: "inherit",
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`docker compose exited with code ${code}`));
			}
		});
	});
}

function runDockerComposeCapture(configDir: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const composeFile = path.join(configDir, "elmo.yaml");
		const commandArgs = ["compose", "-f", composeFile, ...args];
		const child = spawn("docker", commandArgs);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(stderr || `docker compose exited with code ${code}`));
			}
		});
	});
}

function assertDockerRunning(): void {
	const result = spawnSync("docker", ["info"], {
		stdio: "ignore",
	});
	if (result.status !== 0) {
		throw new Error("Docker does not appear to be running. Start Docker and try again.");
	}
}

// ── Docker Dir Resolution ────────────────────────────────────────────────────

async function resolveDockerDirInteractive(cwd: string): Promise<string> {
	const inCwd = await fileExists(path.join(cwd, "Dockerfile"));
	const inDockerDir = await fileExists(path.join(cwd, "docker", "Dockerfile"));
	const defaultDir = inCwd ? "." : inDockerDir ? "docker" : ".";

	const dir = await p.text({
		message: "Path to docker directory (contains Dockerfile)",
		defaultValue: defaultDir,
	});
	assertNotCancelled(dir);

	const resolved = path.resolve(cwd, dir);
	if (!(await fileExists(path.join(resolved, "Dockerfile")))) {
		p.log.error(`Dockerfile not found in ${resolved}. Provide the directory that contains Dockerfile.`);
		process.exit(1);
	}

	return resolved;
}

async function resolveDockerDirAuto(cwd: string, explicitDir?: string): Promise<string> {
	if (explicitDir) {
		const resolved = path.resolve(cwd, explicitDir);
		if (!(await fileExists(path.join(resolved, "Dockerfile")))) {
			throw new Error(`Dockerfile not found in ${resolved}`);
		}
		return resolved;
	}

	// Auto-detect
	if (await fileExists(path.join(cwd, "docker", "Dockerfile"))) {
		return path.resolve(cwd, "docker");
	}
	if (await fileExists(path.join(cwd, "Dockerfile"))) {
		return cwd;
	}

	throw new Error("Could not find Dockerfile. Specify --docker-dir or set ELMO_DOCKER_DIR.");
}

// ── Config Dir Resolution ────────────────────────────────────────────────────

async function resolveConfigDir(explicitDir?: string): Promise<string> {
	if (explicitDir) {
		const resolved = path.resolve(process.cwd(), explicitDir);
		const composePath = path.join(resolved, "elmo.yaml");
		if (!(await fileExists(composePath))) {
			throw new Error(
				`Config directory does not contain elmo.yaml: ${resolved}\nRun \`elmo init\` to create your local setup.`,
			);
		}
		return resolved;
	}

	const config = await readGlobalConfig();
	if (!config?.configDir) {
		throw new Error("No config found. Run `elmo init` or specify --dir.");
	}

	const resolved = path.resolve(config.configDir);
	const composePath = path.join(resolved, "elmo.yaml");
	if (!(await fileExists(composePath))) {
		throw new Error(`Config directory does not contain elmo.yaml: ${resolved}\nRun \`elmo init\` to regenerate.`);
	}
	return resolved;
}

// ── File & Config Helpers ────────────────────────────────────────────────────

async function readGlobalConfig(): Promise<GlobalConfig | null> {
	try {
		const contents = await fs.readFile(CONFIG_FILE, "utf8");
		return JSON.parse(contents) as GlobalConfig;
	} catch {
		return null;
	}
}

async function writeGlobalConfig(config: {
	configDir: string;
	dockerDir?: string;
	dev?: boolean;
	postgresMode?: PostgresMode;
	repoRoot?: string;
}): Promise<void> {
	const globalConfig: GlobalConfig = {
		...config,
		updatedAt: new Date().toISOString(),
	};
	await ensureDir(CONFIG_HOME);
	await fs.writeFile(CONFIG_FILE, JSON.stringify(globalConfig, null, 2), "utf8");
}

async function writeConfigFiles(
	configDir: string,
	initConfig: {
		env: EnvMap;
		composeYaml: string;
		postgresMode: PostgresMode;
		dev: boolean;
	},
): Promise<void> {
	const envPath = path.join(configDir, ".env");
	const composePath = path.join(configDir, "elmo.yaml");

	await ensureDir(configDir);
	await fs.writeFile(envPath, buildEnvFile(initConfig.env), "utf8");
	await fs.writeFile(composePath, initConfig.composeYaml, "utf8");
}

function buildEnvFile(env: EnvMap): string {
	const lines = ["# Generated by elmo init", "# WARNING: contains secrets. Do not commit.", ""];

	for (const [key, rawValue] of Object.entries(env)) {
		if (rawValue === undefined) {
			continue;
		}
		lines.push(`${key}=${formatEnvValue(rawValue)}`);
	}

	return `${lines.join("\n")}\n`;
}

function formatEnvValue(value: string): string {
	if (value === "") {
		return '""';
	}
	if (/[\s#"']/u.test(value)) {
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
}

async function detectSettingsFromConfig(configDir: string): Promise<{
	dev: boolean;
	postgresMode: PostgresMode;
	repoRoot: string;
	dockerDir?: string;
}> {
	const envPath = path.join(configDir, ".env");
	const env = await readEnvFile(envPath);

	const postgresMode: PostgresMode = env.DATABASE_URL?.includes("postgres:5432") ? "docker" : "external";

	const yamlPath = path.join(configDir, "elmo.yaml");
	let dev = false;
	let repoRoot = process.cwd();

	try {
		const yamlContent = await fs.readFile(yamlPath, "utf8");
		dev = yamlContent.includes("build:");
		const contextMatch = yamlContent.match(/context:\s+(.+)/);
		if (contextMatch) {
			repoRoot = contextMatch[1].trim();
		}
	} catch {
		// Use defaults
	}

	return { dev, postgresMode, repoRoot };
}

async function updateDeploymentEnvTelemetry(enabled: boolean): Promise<string | null> {
	const config = await readGlobalConfig();
	if (!config?.configDir) return null;
	const envPath = path.join(config.configDir, ".env");
	if (!(await fileExists(envPath))) return null;

	const contents = await fs.readFile(envPath, "utf8");
	const lines = contents.split("\n");
	const filtered = lines.filter((line) => !/^\s*DISABLE_TELEMETRY\s*=/.test(line));
	if (!enabled) {
		const insertIdx =
			filtered.length > 0 && filtered[filtered.length - 1] === "" ? filtered.length - 1 : filtered.length;
		filtered.splice(insertIdx, 0, "DISABLE_TELEMETRY=1");
	}
	await fs.writeFile(envPath, filtered.join("\n"), "utf8");
	return envPath;
}

async function readEnvFile(envPath: string): Promise<EnvMap> {
	try {
		const contents = await fs.readFile(envPath, "utf8");
		const env: EnvMap = {};
		for (const line of contents.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIndex = trimmed.indexOf("=");
			if (eqIndex < 0) continue;
			const key = trimmed.substring(0, eqIndex);
			let value = trimmed.substring(eqIndex + 1);
			// Remove surrounding quotes
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			env[key] = value;
		}
		return env;
	} catch {
		return {};
	}
}

async function fileExists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}

// ── Version Helpers ──────────────────────────────────────────────────────────

async function getPackageVersion(): Promise<string> {
	const selfDir = path.dirname(fileURLToPath(import.meta.url));
	const packagePath = path.resolve(selfDir, "..", "package.json");
	const contents = await fs.readFile(packagePath, "utf8");
	const json = JSON.parse(contents) as { version?: string };
	return json.version!;
}

async function maybeNotifyNewVersion(currentVersion: string): Promise<void> {
	try {
		const response = await fetch("https://registry.npmjs.org/@elmohq/cli/latest");
		if (!response.ok) {
			return;
		}
		const data = (await response.json()) as {
			version?: string;
		};
		if (!data.version) {
			return;
		}
		if (semver.valid(currentVersion) && semver.lt(currentVersion, data.version)) {
			log.warn(`New CLI version available (${data.version}). Run: npm install -g @elmohq/cli@latest`);
		}
	} catch {
		// Ignore update errors
	}
}

// ── Entry Point ──────────────────────────────────────────────────────────────

main().catch((error) => {
	const msg = error instanceof Error ? error.message : String(error);
	console.error(`\n${pc.red("Error:")} ${msg}`);
	process.exit(1);
});
