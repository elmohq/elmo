#!/usr/bin/env node
import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { formatScrapeTarget, parseScrapeTargets } from "@workspace/config/scrape-targets";
import { Command } from "commander";
import { parse as parseDotenv } from "dotenv";
import pc from "picocolors";
import semver from "semver";
import { parse as parseYaml } from "yaml";
import { buildComposeYaml, type PostgresMode } from "./compose-builder.js";
import { assertSchemaBoundaryExecutionConfig } from "./compose-execution-safety.js";
import { type ImageReleasePlan, parseRenderedVersion, planImageRelease, renderedByHeader } from "./compose-pin.js";
import {
	ALL_PROFILE_SERVICE_CONFIG_ARGS,
	applicationStartupOrder,
	assertApplicationServicesHealthy,
	assertSafeUpgradeComposeState,
	assertSafeUpgradeServiceNames,
	assertServicesQuiescent,
	composeCommandMayMutateDeployment,
	parseComposeImageReference,
	parseComposeServiceNames,
	runningApplicationServiceNames,
	runningComposeServiceNames,
} from "./compose-state.js";
import { assertSupportedDockerComposeVersion } from "./compose-version.js";
import {
	acquireUpgradeCutoverLock as acquireDatabaseCutoverLock,
	assertUpgradeCutoverLockOwned,
	createSourceRuntimeFenceIdentity,
	createUpgradeCutoverLockIdentity,
	releaseUpgradeCutoverLock as releaseDatabaseCutoverLock,
} from "./database-cutover-lock.js";
import {
	assertSessionAffineDatabaseUrl,
	isCliManagedLocalPostgresDatabaseUrl,
	verifyDatabaseConnectionIdentity,
} from "./database-identity-verification.js";
import {
	developmentElmoBuildServiceNames,
	prepareTargetDevelopmentMigrationImage,
	runTargetDatabaseMigration,
	UPGRADE_MIGRATOR_SERVICE_NAME,
	usesDevelopmentElmoBuild,
} from "./database-migration.js";
import {
	assertNoConflictingUpgradeMigrators,
	createUpgradeMigratorIdentity,
	recoverExistingUpgradeMigrator,
} from "./database-migration-recovery.js";
import { setDatabaseRuntimeGeneration } from "./database-runtime-generation.js";
import { assertRecoveryStateOutsideDevelopmentBuildContexts } from "./development-build-safety.js";
import { resolveDevelopmentBackupImageId } from "./development-image-backup.js";
import { assertDevelopmentSourceVersion } from "./development-source-version.js";
import { assertSameDockerEngineIdentity, captureDockerEngineIdentity } from "./docker-engine-identity.js";
import { formatEnvValue, setEnvFileValue } from "./env-file.js";
import {
	MIGRATIONS,
	type MigrationContext,
	planMigrations,
	reconcileCurrentConfig,
	runMigrations,
} from "./migrations/index.js";
import {
	assertComposeServiceImageIds,
	attestRollbackSchemaCompatibility,
	CLOUD_SCHEMA_COMPATIBILITY,
	captureRollbackRuntimeImages,
	INCOMPATIBLE_RUNTIME_FENCE_GENERATIONS,
	type RollbackRuntimeImage,
	requireSchemaCompatibleImages,
	requiresHardRecoveryGuidance,
	requiresTargetRecoveryFence,
	restoreRollbackRuntimeImages,
	TargetRecoveryFenceError,
} from "./rollback-compatibility.js";
import { submitNewsletterSignup, trackCliEvent } from "./telemetry.js";
import { completeDeploymentUpgrade, DeploymentUpgradeError, executeDeploymentUpgrade } from "./upgrade-execution.js";
import { acquireUpgradeLock, withUpgradeLock } from "./upgrade-lock.js";
import {
	crossesCloudSchemaBoundary,
	legacySingleDeploymentCutoverAllowed,
	requiresMaintenanceUpgrade,
} from "./upgrade-policy.js";
import {
	advanceUpgradeRecoveryState,
	type DevelopmentImageBackup,
	type PreparedTargetImageIds,
	readUpgradeRecoveryState,
	reconcilePreparedTargetImageIds,
	recoveryFilePath,
	removeUpgradeRecoveryState,
	type UpgradeRecoveryPhase,
	writeUpgradeRecoveryState,
} from "./upgrade-recovery.js";
import { applyDeploymentRelease, captureDeploymentConfig, restoreDeploymentConfig } from "./upgrade-release.js";
import { deploymentUpgradeIdentity } from "./upgrade-storage.js";

// ── Types ────────────────────────────────────────────────────────────────────

type ComposeService = {
	ID?: string;
	Name?: string;
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

type UpgradeOptions = {
	acknowledgeSingleDeployment?: boolean;
	dir?: string;
	yes?: boolean;
};

type EnvMap = Record<string, string>;

// ── Constants ────────────────────────────────────────────────────────────────

const CONFIG_HOME = path.join(os.homedir(), ".elmo");
const DEFAULT_APP_NAME = "Elmo";
const DEFAULT_APP_ICON = "/icons/elmo-icon.svg";
const DEFAULT_APP_PORT = 1515;
const LOCAL_DATABASE_URL = "postgres://postgres:postgres@postgres:5432/elmo";
const LEGACY_RUNTIME_QUIESCENCE_MS = 15_000;
const TELEMETRY_DOC_URL = "https://elmohq.com/docs/developer-guide/telemetry";

const activeDockerChildren = new Map<ChildProcess, Promise<void>>();
let shutdownSignal: "SIGINT" | "SIGTERM" | undefined;

function trackDockerChild(child: ChildProcess): void {
	let resolveExit = () => {};
	const exited = new Promise<void>((resolve) => {
		resolveExit = resolve;
	});
	activeDockerChildren.set(child, exited);
	child.once("close", () => {
		activeDockerChildren.delete(child);
		resolveExit();
	});
}

async function waitForDockerChildren(): Promise<void> {
	while (activeDockerChildren.size > 0) {
		await Promise.allSettled([...activeDockerChildren.values()]);
	}
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		shutdownSignal ??= signal;
		process.exitCode = signal === "SIGINT" ? 130 : 143;
		for (const child of activeDockerChildren.keys()) child.kill(signal);
	});
}

function assertUpgradeNotInterrupted(): void {
	if (shutdownSignal) throw new Error(`Upgrade interrupted by ${shutdownSignal}; rerun the same CLI version to resume`);
}

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

class CommandCancelledError extends Error {}

function assertNotCancelled<T>(value: T | symbol): asserts value is T {
	if (p.isCancel(value)) {
		p.cancel("Setup cancelled.");
		throw new CommandCancelledError("Command cancelled");
	}
}

function generateSecret(bytes = 32, encoding: BufferEncoding = "base64url"): string {
	return crypto.randomBytes(bytes).toString(encoding);
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
		.option("--dir <path>", "Config directory")
		.configureHelp({ showGlobalOptions: true })
		.action(() => {
			printBanner();
			program.outputHelp();
		});

	program
		.command("init")
		.description("set up local Elmo instance")
		.option("--dev", "Use local build context (repo only)")
		.option("--docker-dir <path>", "Path to Docker build context (dev mode)")
		.action(async (_opts: object, cmd: Command) => {
			await withVersionCheck(version, () => runInit(cmd.optsWithGlobals<InitOptions>(), version));
		});

	program
		.command("compose")
		.description("run Docker Compose commands using your Elmo config")
		.allowUnknownOption(true)
		.argument("[args...]", "Arguments passed to Docker Compose")
		.action(async (args: string[], _opts: object, cmd: Command) => {
			await withVersionCheck(version, () => runCompose(args, cmd.optsWithGlobals<DirOption>()));
		});

	program
		.command("edit")
		.description("change API keys, scrape targets, or the Docker Compose YAML")
		.argument("<env|compose>", "which config file to edit")
		.action(async (target: string, _opts: object, cmd: Command) => {
			await runEdit(target, cmd.optsWithGlobals<DirOption>());
		});

	program
		.command("upgrade")
		.description("upgrade your Elmo deployment to this CLI's version")
		.option("--yes", "skip confirmation prompts")
		.option("--acknowledge-single-deployment", "confirm this local external database is used by no other Elmo runtime")
		.action(async (_opts: object, cmd: Command) => {
			await runUpgrade(cmd.optsWithGlobals<UpgradeOptions>(), version);
		});

	await program.parseAsync(process.argv);
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
	const configDir = options.dir ? path.resolve(cwd, options.dir) : CONFIG_HOME;
	await ensureDir(configDir);
	await withUpgradeLock(configDir, async () => {
		const recovery = await readUpgradeRecoveryState(configDir);
		if (recovery) {
			throw new Error(
				`Cannot replace deployment config while the ${recovery.fromVersion} → ${recovery.targetVersion} upgrade is incomplete. Resume with that CLI version.`,
			);
		}
		await runLockedInit(options, version, cwd, configDir);
	});
}

async function runLockedInit(options: InitOptions, version: string, cwd: string, configDir: string): Promise<void> {
	// ── .env safety check ────────────────────────────────────────────────
	const existingEnvPath = path.join(configDir, ".env");
	if (await fileExists(path.join(configDir, "elmo.yaml"))) {
		throw new Error(
			"An Elmo deployment already exists here. Use `elmo upgrade` or `elmo edit` instead of `elmo init`.",
		);
	}
	if (await fileExists(existingEnvPath)) {
		const contents = await fs.readFile(existingEnvPath, "utf8");
		const isElmoEnv = contents.startsWith("# Rendered by elmo") || contents.startsWith("# Generated by elmo");

		if (!isElmoEnv) {
			p.log.warn(`A .env file already exists in ${configDir} and was NOT created by Elmo.`);
			const overwrite = await p.confirm({
				message: "Overwrite the existing .env file? This cannot be undone.",
				initialValue: false,
			});
			assertNotCancelled(overwrite);
			if (!overwrite) {
				p.cancel("Setup cancelled. Choose a different directory with --dir.");
				throw new CommandCancelledError("Command cancelled");
			}
		} else {
			throw new Error(
				"An Elmo deployment already exists here. Use `elmo upgrade` or `elmo edit` instead of `elmo init`.",
			);
		}
	}

	// ── Dev mode: resolve docker directory ───────────────────────────────
	let dockerDir: string | undefined;
	let repoRoot: string;

	if (options.dev) {
		if (options.dockerDir) {
			dockerDir = path.resolve(cwd, options.dockerDir);
			if (!(await fileExists(path.join(dockerDir, "Dockerfile")))) {
				throw new Error(`Dockerfile not found in ${dockerDir}`);
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
				label: "Use existing Postgres (provide application and direct URLs)",
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
	// Standard base64 (not base64url): the app decodes this with Buffer.from(key,
	// "base64") and requires exactly 32 bytes. Enables storing provider
	// credentials encrypted in the database via the in-app Providers UI.
	env.ELMO_ENCRYPTION_KEY = generateSecret(32, "base64");
	env.APP_NAME = DEFAULT_APP_NAME;
	env.APP_ICON = DEFAULT_APP_ICON;
	env.VITE_APP_NAME = DEFAULT_APP_NAME;
	env.VITE_APP_ICON = DEFAULT_APP_ICON;

	if (postgresMode === "external") {
		p.note("May be a direct connection or database pooler.", "DATABASE_URL");
		const url = await p.password({
			message: "DATABASE_URL",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(url);
		env.DATABASE_URL = url;
		p.note(
			"Must be a direct, session-affine PostgreSQL endpoint and identify the same database.",
			"DATABASE_URL_UNPOOLED",
		);
		const unpooledUrl = await p.password({
			message: "DATABASE_URL_UNPOOLED",
			validate: (value) => {
				try {
					assertSessionAffineDatabaseUrl(value);
					return undefined;
				} catch (error) {
					return error instanceof Error ? error.message : "Invalid direct PostgreSQL URL";
				}
			},
		});
		assertNotCancelled(unpooledUrl);
		env.DATABASE_URL_UNPOOLED = unpooledUrl;
	} else {
		env.DATABASE_URL = LOCAL_DATABASE_URL;
		env.DATABASE_URL_UNPOOLED = LOCAL_DATABASE_URL;
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
			"  • deployment ID (random UUID stored as DEPLOYMENT_ID in your .env)",
			"  • CLI/app version, OS, arch, Node version, deployment mode",
			"  • command/event names + non-secret options (e.g. postgres mode)",
			"  • feature counts (prompts edited, brands created — never the names or text)",
			"  • IP address (recorded on each event by PostHog, used for geolocation)",
			"",
			pc.bold("What we never send:"),
			"  API keys, .env contents, brand names, prompt text, and scraped responses.",
			"",
			`Full breakdown: ${link(pc.cyan(TELEMETRY_DOC_URL), TELEMETRY_DOC_URL)}`,
			"Toggle later by editing DISABLE_TELEMETRY in .env (`elmo edit env`).",
		].join("\n"),
		"Telemetry",
	);

	const telemetryEnabled = await p.confirm({
		message: "Share telemetry?",
		initialValue: true,
	});
	assertNotCancelled(telemetryEnabled);
	if (!telemetryEnabled) {
		env.DISABLE_TELEMETRY = "1";
	}

	// ── Product updates ─────────────────────────────────────────────────
	const updatesEmail = await p.text({
		message: "Enter your work email to receive product updates (optional)",
		placeholder: "you@example.com",
	});
	const email = p.isCancel(updatesEmail) ? undefined : updatesEmail || undefined;

	// ── Web app port ────────────────────────────────────────────────────
	const portInput = await p.text({
		message: "Web app port",
		placeholder: String(DEFAULT_APP_PORT),
		defaultValue: String(DEFAULT_APP_PORT),
		validate: (v) => {
			if (!v) return undefined;
			const n = Number(v);
			if (!Number.isInteger(n) || n < 1 || n > 65535) {
				return "Must be an integer between 1 and 65535";
			}
			return undefined;
		},
	});
	assertNotCancelled(portInput);
	const port = Number(portInput);
	env.APP_URL = `http://localhost:${port}`;
	env.VITE_APP_URL = env.APP_URL;

	// ── Write config ─────────────────────────────────────────────────────
	const composeYaml = buildComposeYaml({
		dev: Boolean(options.dev),
		postgresMode,
		repoRoot,
		dockerDir,
		port,
		version,
	});

	await ensureDir(configDir);
	await writeConfigFiles(configDir, {
		env,
		composeYaml,
		postgresMode,
		dev: Boolean(options.dev),
		version,
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
		p.log.info("You can start later with `elmo compose up -d`.");
	}

	// CLI telemetry — silently dropped if the user opted out above.
	await trackCliEvent(configDir, "cli_init", {
		version,
		os: process.platform,
		arch: process.arch,
		node_version: process.version,
		postgres_mode: postgresMode,
		dev_mode: Boolean(options.dev),
		setup_mode: setupMode,
		has_scraper: Boolean(env.BRIGHTDATA_API_TOKEN || env.OLOSTEP_API_KEY || env.OXYLABS_USERNAME || env.CLORO_API_KEY),
		has_direct_api: hasDirectApiConfigured(env),
	});

	// Newsletter signup is a separate, explicit opt-in and runs even when
	// telemetry is disabled.
	if (email) {
		await submitNewsletterSignup(configDir, email);
	}

	p.log.message(
		`If you find Elmo useful, star us on GitHub!\n  ${link(pc.cyan("https://github.com/elmohq/elmo"), "https://github.com/elmohq/elmo")}`,
	);

	p.outro(pc.green("Setup complete!"));
}

// ── Provider Configuration ───────────────────────────────────────────────────

const BRIGHTDATA_AFFILIATE = "https://get.brightdata.com/67h1b7h0shcn";
const OLOSTEP_AFFILIATE = "https://olostep.com/?ref=elmo";
const OXYLABS_AFFILIATE = "https://oxylabs.go2cloud.org/aff_c?offer_id=7&aff_id=2263&url_id=32";
const CLORO_AFFILIATE = "https://cloro.dev?fpr=elmo";
const PROVIDERS_DOC_URL = "https://docs.elmohq.com/docs/user-guide/providers";

// Surfaces each scraper can track — the first two are the "recommended starter" set.
const BRIGHTDATA_MODELS = [
	"chatgpt",
	"google-ai-mode",
	"google-ai-overview",
	"perplexity",
	"copilot",
	"gemini",
] as const;

const OLOSTEP_MODELS = ["chatgpt", "google-ai-mode", "google-ai-overview", "perplexity", "copilot", "gemini"] as const;

const OXYLABS_MODELS = ["chatgpt", "google-ai-mode", "google-ai-overview", "perplexity"] as const;

const CLORO_MODELS = ["chatgpt", "google-ai-mode", "google-ai-overview", "perplexity", "copilot", "gemini"] as const;

const DEFAULT_SCRAPER_MODELS = ["chatgpt", "google-ai-mode"] as const;
const DATAFORSEO_MODELS = ["google-ai-mode", "google-ai-overview", "chatgpt", "perplexity", "gemini"] as const;

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6";
const DEFAULT_MISTRAL_MODEL = "mistral-medium-latest";

async function configureProvidersInteractive(env: EnvMap): Promise<"recommended" | "custom"> {
	p.note(
		[
			"Elmo needs two kinds of providers:",
			"",
			pc.bold("1. A scraper") + " — to track ChatGPT and Google AI Mode (no public APIs):",
			`     • ${pc.cyan("BrightData")} — cheap solid option, ~$0.45/mo per prompt`,
			`     • ${pc.cyan("Oxylabs")}    — async job API, pay-as-you-go`,
			`     • ${pc.cyan("Cloro")}      — every surface, credit plans from $30/mo, ~$0.65/mo per prompt`,
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
			{ value: "recommended" as const, label: "Recommended — one scraper + one direct API" },
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
			{ value: "oxylabs" as const, label: "Oxylabs — async job API, pay-as-you-go" },
			{ value: "cloro" as const, label: "Cloro — ~$0.65/mo per prompt (credit plans from $30/mo)" },
			{ value: "olostep" as const, label: "Olostep — ~$2.25/mo per prompt (premium)" },
		],
		initialValue: "brightdata" as const,
	});
	assertNotCancelled(scraper);
	await collectScraperKey(scraper, env);
	for (const model of DEFAULT_SCRAPER_MODELS) {
		targets.push(formatScrapeTarget({ model, provider: scraper, webSearch: true }));
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
	await collectDirectApiQuick(direct, env);

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
	await collectOxylabs(env, targets);
	await collectCloro(env, targets);
	await collectOlostep(env, targets);
	await collectDataForSEO(env, targets);

	await finalizeScrapeTargets(env, targets);
}

function hasDirectApiConfigured(env: EnvMap): boolean {
	return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.MISTRAL_API_KEY || env.OPENROUTER_API_KEY);
}

async function collectScraperKey(scraper: "brightdata" | "olostep" | "oxylabs" | "cloro", env: EnvMap): Promise<void> {
	if (scraper === "brightdata") {
		p.log.info(`Sign up: ${link(pc.cyan(BRIGHTDATA_AFFILIATE), BRIGHTDATA_AFFILIATE)}`);
		const key = await p.password({
			message: "BrightData API token",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.BRIGHTDATA_API_TOKEN = key;
	} else if (scraper === "oxylabs") {
		p.log.info(`Sign up: ${link(pc.cyan(OXYLABS_AFFILIATE), OXYLABS_AFFILIATE)}`);
		const username = await p.text({
			message: "Oxylabs username",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(username);
		env.OXYLABS_USERNAME = username;
		const password = await p.password({
			message: "Oxylabs password",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(password);
		env.OXYLABS_PASSWORD = password;
	} else if (scraper === "cloro") {
		p.log.info(`Sign up: ${link(pc.cyan(CLORO_AFFILIATE), CLORO_AFFILIATE)}`);
		const key = await p.password({
			message: "Cloro API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.CLORO_API_KEY = key;
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
): Promise<void> {
	if (kind === "openrouter") {
		const key = await p.password({
			message: "OpenRouter API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.OPENROUTER_API_KEY = key;
	} else if (kind === "anthropic") {
		const key = await p.password({
			message: "Anthropic API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.ANTHROPIC_API_KEY = key;
	} else if (kind === "openai") {
		const key = await p.password({
			message: "OpenAI API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.OPENAI_API_KEY = key;
	} else {
		const key = await p.password({
			message: "Mistral API key",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.MISTRAL_API_KEY = key;
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

async function collectOxylabs(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("Oxylabs")}? (async job API, pay-as-you-go)`,
		initialValue: false,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	p.log.info(`Sign up and create Web Scraper API credentials: ${link(pc.cyan(OXYLABS_AFFILIATE), OXYLABS_AFFILIATE)}`);
	const username = await p.text({
		message: "Oxylabs username",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(username);
	env.OXYLABS_USERNAME = username;

	const password = await p.password({
		message: "Oxylabs password",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(password);
	env.OXYLABS_PASSWORD = password;

	await pickScraperTargets({
		providerLabel: "Oxylabs",
		providerId: "oxylabs",
		allModels: OXYLABS_MODELS as readonly string[],
		targets,
	});
}

async function collectCloro(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("Cloro")}? (async task API, credit plans from $30/mo)`,
		initialValue: false,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	p.log.info(`Sign up and create an API key: ${link(pc.cyan(CLORO_AFFILIATE), CLORO_AFFILIATE)}`);
	const key = await p.password({
		message: "Cloro API key",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(key);
	env.CLORO_API_KEY = key;

	await pickScraperTargets({
		providerLabel: "Cloro",
		providerId: "cloro",
		allModels: CLORO_MODELS as readonly string[],
		targets,
	});
}

async function pickScraperTargets(args: {
	providerLabel: string;
	providerId: "brightdata" | "olostep" | "oxylabs" | "cloro";
	allModels: readonly string[];
	targets: string[];
}): Promise<void> {
	const selected = (await p.multiselect({
		message: `LLM Providers to track via ${args.providerLabel}`,
		options: args.allModels.map((model) => ({ value: model, label: model })),
		required: true,
		initialValues: [...DEFAULT_SCRAPER_MODELS],
	})) as string[] | symbol;
	assertNotCancelled(selected);

	for (const model of selected) {
		args.targets.push(formatScrapeTarget({ model, provider: args.providerId, webSearch: true }));
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
		message: "Enable web search? (recommended, but more expensive)",
		initialValue: true,
	});
	assertNotCancelled(webSearch);

	targets.push(formatScrapeTarget({ model: "claude", provider: "anthropic-api", version: slug, webSearch }));
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
		message: "Enable web search? (recommended, but more expensive)",
		initialValue: true,
	});
	assertNotCancelled(webSearch);

	targets.push(formatScrapeTarget({ model: "chatgpt", provider: "openai-api", version: slug, webSearch }));
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
		message: "Enable web search? (recommended, but more expensive)",
		initialValue: true,
	});
	assertNotCancelled(webSearch);

	targets.push(formatScrapeTarget({ model: "mistral", provider: "mistral-api", version: slug, webSearch }));
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
		message: "Enable web search? (recommended, but more expensive)",
		initialValue: true,
	});
	assertNotCancelled(webSearch);

	targets.push(formatScrapeTarget({ model: "claude", provider: "openrouter", version: slug, webSearch }));
}

async function collectDataForSEO(env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("DataForSEO")}? (Google AI Mode + LLM Responses)`,
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

	const selected = (await p.multiselect({
		message: "LLM Providers to track via DataForSEO",
		options: DATAFORSEO_MODELS.map((model) => ({ value: model, label: model })),
		required: false,
		initialValues: ["google-ai-mode"],
	})) as string[] | symbol;
	assertNotCancelled(selected);

	for (const model of selected) {
		targets.push(formatScrapeTarget({ model, provider: "dataforseo", webSearch: true }));
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
				validate: validateScrapeTargetsInput,
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
			validate: validateScrapeTargetsInput,
		});
		assertNotCancelled(manual);
		env.SCRAPE_TARGETS = manual;
		p.log.step(`SCRAPE_TARGETS:\n  ${pc.cyan(manual)}`);
	} else {
		env.SCRAPE_TARGETS = deduped;
	}
}

function validateScrapeTargetsInput(value: string | undefined): string | undefined {
	if (!value) return "Required";
	try {
		parseScrapeTargets(value);
	} catch (error) {
		return error instanceof Error ? error.message.split("\n")[0] : String(error);
	}
	return undefined;
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

// ── Start helper (used by init) ──────────────────────────────────────────────

async function doStart(configDir: string): Promise<void> {
	await assertDockerRunning();
	await assertDockerComposeSupported();

	log.step("Starting Docker Compose stack...");
	await startServicesAndWait(configDir, ["web", "worker"]);
	await assertServicesReady(configDir, ["web", "worker"]);
	log.success("Web and worker services are healthy.");

	log.info("Examples:");
	console.log(`  ${pc.bold("elmo compose logs -f")}`);
	console.log(`  ${pc.bold("elmo compose logs -f web")}`);
	console.log(`  ${pc.bold("elmo compose ps")}`);
	console.log(`  ${pc.bold("elmo compose down")}`);
}

// ── Command: compose ─────────────────────────────────────────────────────────

async function runCompose(args: string[], options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	if (composeCommandMayMutateDeployment(args)) {
		await withUpgradeLock(configDir, async () => {
			const recovery = await readUpgradeRecoveryState(configDir);
			if (recovery) {
				throw new Error(
					`Cannot mutate deployment services while the ${recovery.fromVersion} → ${recovery.targetVersion} upgrade is incomplete. Resume with that CLI version; recovery state is at ${await recoveryFilePath(configDir)}.`,
				);
			}
			await assertDockerRunning();
			await runDockerCompose(configDir, args);
		});
		return;
	}
	await assertDockerRunning();
	await runDockerCompose(configDir, args);
}

// ── Command: edit ────────────────────────────────────────────────────────────

async function runEdit(target: string, options: DirOption): Promise<void> {
	const configDir = await resolveConfigDir(options.dir);
	await withUpgradeLock(configDir, async () => {
		const recovery = await readUpgradeRecoveryState(configDir);
		if (recovery) {
			throw new Error(
				`Cannot edit deployment config while the ${recovery.fromVersion} → ${recovery.targetVersion} upgrade is incomplete. Resume with that CLI version.`,
			);
		}

		let filePath: string;
		if (target === "env") {
			filePath = path.join(configDir, ".env");
		} else if (target === "compose") {
			filePath = path.join(configDir, "elmo.yaml");
		} else {
			throw new Error(`Unknown edit target: ${target}. Use \`env\` or \`compose\`.`);
		}

		if (!(await fileExists(filePath))) {
			throw new Error(`File not found: ${filePath}`);
		}

		const editorEnv = process.env.VISUAL || process.env.EDITOR || "nano";
		const parts = editorEnv.split(/\s+/).filter(Boolean);
		const cmd = parts[0] ?? "nano";
		const args = [...parts.slice(1), filePath];

		await new Promise<void>((resolve, reject) => {
			const child = spawn(cmd, args, { stdio: "inherit" });
			child.on("close", (code) => {
				if (code === 0) resolve();
				else reject(new Error(`${cmd} exited with code ${code}`));
			});
			child.on("error", (err) => reject(err));
		});
	});

	log.info("Restart the stack with `elmo compose up -d` to apply changes.");
}

// ── Command: upgrade ───────────────────────────────────────────────────────────

async function runUpgrade(options: UpgradeOptions, cliVersion: string): Promise<void> {
	printBanner();
	p.intro(pc.bold("Upgrading Elmo"));

	// ── CLI freshness check ──────────────────────────────────────────────
	const latestCli = await fetchLatestCliVersion();
	if (latestCli && semver.valid(cliVersion) && semver.lt(cliVersion, latestCli)) {
		log.warn(`Your CLI (${cliVersion}) is behind the latest published version (${latestCli}).`);
		log.info("Recommended: upgrade the CLI first, then rerun this command:");
		console.log(`  ${pc.bold("npm install -g @elmohq/cli@latest")}`);
		const proceed = options.yes
			? true
			: await p.confirm({
					message: `Continue upgrading the stack with CLI ${cliVersion} anyway?`,
					initialValue: false,
				});
		assertNotCancelled(proceed);
		if (!proceed) {
			p.cancel("Upgrade cancelled. Upgrade the CLI and rerun `elmo upgrade`.");
			return;
		}
	}

	// ── Resolve config + the version it was last rendered with ───────────
	const configDir = await resolveConfigDir(options.dir);
	const releaseUpgradeLock = await acquireUpgradeLock(configDir);
	try {
		await ensureUpgradeDatabaseConnectionContract(configDir);
		const deploymentId = await ensureUpgradeDeploymentId(configDir);
		await runLockedUpgrade(options, cliVersion, configDir, deploymentId);
	} finally {
		await waitForDockerChildren();
		await releaseUpgradeLock();
	}
}

async function runLockedUpgrade(
	options: UpgradeOptions,
	cliVersion: string,
	configDir: string,
	deploymentId: string,
): Promise<void> {
	const composePath = path.join(configDir, "elmo.yaml");
	const { databaseFingerprint } = await deploymentUpgradeIdentity(configDir);
	const interruptedUpgrade = await readUpgradeRecoveryState(configDir);
	if (interruptedUpgrade && interruptedUpgrade.targetVersion !== cliVersion) {
		throw new Error(
			`An interrupted upgrade targets ${interruptedUpgrade.targetVersion}. Use that CLI version to resume; recovery state is at ${await recoveryFilePath(configDir)}.`,
		);
	}
	const renderedVersion = await readRenderedVersion(composePath);
	const detectedVersion = interruptedUpgrade ? interruptedUpgrade.detectedVersion : renderedVersion;
	const fromVersion = interruptedUpgrade?.fromVersion ?? detectedVersion ?? cliVersion;
	if (!semver.valid(fromVersion)) {
		throw new Error(`Could not determine the installed version from ${composePath}.`);
	}
	if (interruptedUpgrade) {
		log.warn(
			`Resuming an interrupted ${fromVersion} → ${cliVersion} upgrade from ${interruptedUpgrade.phase}; prior service state is preserved.`,
		);
	}

	if (semver.gt(fromVersion, cliVersion)) {
		log.warn(`Your deployment (${fromVersion}) is newer than this CLI (${cliVersion}).`);
		log.info("Upgrade the CLI to match, then rerun:");
		console.log(`  ${pc.bold("npm install -g @elmohq/cli@latest")}`);
		if (!process.exitCode) process.exitCode = 1;
		return;
	}

	// ── Already current ──────────────────────────────────────────────────
	// Only a *detected* matching version is "nothing to do". A legacy install
	// with no version header (detectedVersion === null) still needs its image
	// tags re-pinned, so it falls through to the upgrade path below.
	if (!interruptedUpgrade && detectedVersion !== null && semver.eq(detectedVersion, cliVersion)) {
		await reconcileCurrentConfig(buildMigrationContext(configDir));
		log.success(`Already at ${cliVersion}.`);
		p.outro(pc.green("Nothing to upgrade."));
		return;
	}

	// ── Plan migrations ──────────────────────────────────────────────────
	// With no detected version we can't tell which migrations apply, so we skip
	// them and just re-pin + pull. (planMigrations would also return [] here
	// since from === to, but we special-case it for a clearer message.)
	const plan = detectedVersion === null ? [] : planMigrations(fromVersion, cliVersion, MIGRATIONS);
	if (detectedVersion === null) {
		log.warn(`Couldn't detect the deployment's version — re-pinning images to ${pc.cyan(cliVersion)}.`);
	} else {
		log.info(`Upgrading from ${pc.cyan(fromVersion)} → ${pc.cyan(cliVersion)}`);
	}
	if (plan.length === 0) {
		log.step("No migrations to run (docker images will be re-pinned and pulled).");
	} else {
		log.step(`Migrations to apply: ${plan.length}`);
		for (const m of plan) {
			console.log(`  • ${pc.bold(`${m.from} → ${m.to}`)} ${m.description}`);
		}
	}
	const requiresMaintenance =
		interruptedUpgrade?.requiresMaintenance ??
		requiresMaintenanceUpgrade({ detectedVersion, targetVersion: cliVersion, plan });
	const crossesSchemaBoundary = crossesCloudSchemaBoundary({ detectedVersion, targetVersion: cliVersion });
	if (crossesSchemaBoundary) {
		assertSchemaBoundaryExecutionConfig(await fs.readFile(composePath, "utf8"));
	}
	if (requiresMaintenance) {
		log.warn("This upgrade uses a brief maintenance cutover: target images are prepared before web and worker stop.");
	}

	const confirm = options.yes ? true : await p.confirm({ message: "Proceed with upgrade?", initialValue: true });
	assertNotCancelled(confirm);
	if (!confirm) {
		p.cancel("Upgrade cancelled.");
		return;
	}

	await assertDockerRunning();
	await assertDockerComposeSupported();
	if (crossesSchemaBoundary) {
		const databaseEnvironment = parseDotenv(await fs.readFile(path.join(configDir, ".env"), "utf8"));
		assertSchemaBoundaryExecutionConfig(await runDockerComposeCapture(configDir, ["config", "--format", "json"]), {
			databaseUrl: databaseEnvironment.DATABASE_URL ?? "",
			unpooledDatabaseUrl: databaseEnvironment.DATABASE_URL_UNPOOLED ?? "",
			runtimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
		});
	}
	const dockerEngine = await captureDockerEngineIdentity(runDockerCapture, (args) =>
		runDockerComposeCapture(configDir, args),
	);
	if (interruptedUpgrade) assertSameDockerEngineIdentity(interruptedUpgrade.dockerEngine, dockerEngine);
	const migrationIdentity = await createUpgradeMigratorIdentity(configDir);
	const allowCurrentMigrator = interruptedUpgrade?.phase === "migrating-database";
	await assertNoConflictingUpgradeMigrators({
		identity: migrationIdentity,
		allowCurrent: allowCurrentMigrator,
		capture: runDockerCapture,
	});
	assertSafeUpgradeServiceNames(
		parseComposeServiceNames(await runDockerComposeCapture(configDir, [...ALL_PROFILE_SERVICE_CONFIG_ARGS])),
	);
	let observedComposeServices = await getComposeServices(configDir);
	const recoveringAfterContainerRemoval = interruptedUpgrade?.applicationContainersRemoved === true;
	assertSafeUpgradeComposeState(
		observedComposeServices,
		allowCurrentMigrator ? migrationIdentity.containerName : undefined,
		recoveringAfterContainerRemoval,
		[
			interruptedUpgrade?.cutoverLock?.containerName,
			...(interruptedUpgrade?.sourceRuntimeFences ?? []).map((lock) => lock.containerName),
		].filter((name): name is string => Boolean(name)),
	);
	if (recoveringAfterContainerRemoval) {
		const preparedImageIds = interruptedUpgrade.preparedTargetImageIds;
		if (!preparedImageIds) throw new Error("Interrupted cutover did not checkpoint exact target images");
		const presentApplicationServices = [
			...new Set(
				observedComposeServices
					.map((service) => service.Service)
					.filter((service): service is "web" | "worker" => service === "web" || service === "worker"),
			),
		];
		const targetImages = presentApplicationServices.map((service) => ({
			service,
			imageId: preparedImageIds[service],
		}));
		try {
			await assertComposeServiceImageIds({
				images: targetImages,
				containers: observedComposeServices,
				capture: runDockerCapture,
			});
		} catch (targetError) {
			const rollbackImages =
				interruptedUpgrade.phase === "rolling-back" ? interruptedUpgrade.rollbackImages : undefined;
			const expectedRollbackImages = rollbackImages?.filter((image) =>
				presentApplicationServices.includes(image.service),
			);
			if (!expectedRollbackImages || expectedRollbackImages.length !== presentApplicationServices.length) {
				throw targetError;
			}
			await assertComposeServiceImageIds({
				images: expectedRollbackImages,
				containers: observedComposeServices,
				capture: runDockerCapture,
			});
		}
		const liveApplicationServices = runningApplicationServiceNames(runningComposeServiceNames(observedComposeServices));
		if (liveApplicationServices.length > 0) {
			log.warn("Draining application containers that restarted during interrupted-upgrade recovery...");
			await runDockerCompose(configDir, ["stop", "--timeout", "3900", ...liveApplicationServices]);
			observedComposeServices = await getComposeServices(configDir);
			assertServicesQuiescent(observedComposeServices, liveApplicationServices);
		}
	}
	const recoveredMigratorBeforeReplay = allowCurrentMigrator
		? await recoverExistingUpgradeMigrator({
				identity: migrationIdentity,
				expectedImageId:
					interruptedUpgrade?.preparedTargetImageIds?.dbMigrate ??
					(() => {
						throw new Error("Interrupted migration did not checkpoint its exact migrator image");
					})(),
				targetVersion: cliVersion,
				capture: runDockerCapture,
				run: runDocker,
			})
		: false;
	const observedRunningComposeServices = runningComposeServiceNames(observedComposeServices);
	const observedApplicationServices = [...new Set(observedComposeServices.map((service) => service.Service))].filter(
		(service): service is "web" | "worker" => service === "web" || service === "worker",
	);
	const existingApplicationServices = interruptedUpgrade?.rollbackImages
		? interruptedUpgrade.rollbackImages.map((image) => image.service)
		: observedApplicationServices;
	const runningServices =
		interruptedUpgrade?.previousRunningServices ?? runningApplicationServiceNames(observedRunningComposeServices);
	const anyComposeServiceWasRunning =
		interruptedUpgrade?.anyComposeServiceWasRunning ?? observedRunningComposeServices.length > 0;
	const wasRunning = runningServices.length > 0;
	const rollbackConfiguredImages = interruptedUpgrade
		? undefined
		: {
				web: parseComposeImageReference("web", await runDockerComposeCapture(configDir, ["config", "--images", "web"])),
				worker: parseComposeImageReference(
					"worker",
					await runDockerComposeCapture(configDir, ["config", "--images", "worker"]),
				),
			};
	const rollbackImages =
		interruptedUpgrade?.rollbackImages ??
		(rollbackConfiguredImages
			? await captureRollbackRuntimeImages({
					services: existingApplicationServices,
					containers: observedComposeServices,
					configuredImages: rollbackConfiguredImages,
					capture: runDockerCapture,
				})
			: undefined);
	const rollbackRuntimeFenceGenerations = new Set(
		(rollbackImages ?? [])
			.map((image) => image.runtimeFenceGeneration)
			.filter((generation): generation is string => Boolean(generation)),
	);
	const rollbackRuntimeFenceImageCount = (rollbackImages ?? []).filter((image) => image.runtimeFenceGeneration).length;
	if (rollbackRuntimeFenceImageCount > 0 && rollbackRuntimeFenceImageCount !== (rollbackImages?.length ?? 0)) {
		throw new Error("Current web and worker images do not consistently attest runtime fence participation");
	}
	if (rollbackRuntimeFenceGenerations.size > 1) {
		throw new Error("Current web and worker images attest different runtime fence generations");
	}
	const checkpointedRuntimeFenceGenerations = new Set(
		(interruptedUpgrade?.sourceRuntimeFences ?? [])
			.map((lock) => lock.runtimeFenceGeneration)
			.filter((generation): generation is string => Boolean(generation)),
	);
	const observedSourceRuntimeFenceGeneration =
		rollbackRuntimeFenceGenerations.size === 1
			? [...rollbackRuntimeFenceGenerations][0]
			: checkpointedRuntimeFenceGenerations.size === 1
				? [...checkpointedRuntimeFenceGenerations][0]
				: undefined;
	const deploymentMode = parseDotenv(await fs.readFile(path.join(configDir, ".env"), "utf8")).DEPLOYMENT_MODE;
	const managedLocalDeployment = await isCliManagedLocalPostgres(configDir);
	const legacySingleDeploymentAcknowledged =
		interruptedUpgrade?.legacySingleDeploymentAcknowledged ?? options.acknowledgeSingleDeployment === true;
	const legacyLocalExternalException = legacySingleDeploymentCutoverAllowed({
		crossesSchemaBoundary,
		deploymentMode,
		managedLocalDeployment,
		runtimeFenceParticipates: Boolean(observedSourceRuntimeFenceGeneration),
		singleDeploymentAcknowledged: legacySingleDeploymentAcknowledged,
	});
	const incompatibleSourceGenerations = INCOMPATIBLE_RUNTIME_FENCE_GENERATIONS[CLOUD_SCHEMA_COMPATIBILITY];
	if (
		crossesSchemaBoundary &&
		observedSourceRuntimeFenceGeneration &&
		observedSourceRuntimeFenceGeneration !== CLOUD_SCHEMA_COMPATIBILITY &&
		!incompatibleSourceGenerations.includes(observedSourceRuntimeFenceGeneration)
	) {
		throw new Error(
			`Source runtime fence generation ${observedSourceRuntimeFenceGeneration} is not a known predecessor of ${CLOUD_SCHEMA_COMPATIBILITY}`,
		);
	}
	const sourceRuntimeFenceGenerations =
		crossesSchemaBoundary && !managedLocalDeployment && !legacyLocalExternalException
			? [...incompatibleSourceGenerations]
			: [];
	const rollbackSchemaCompatibility =
		interruptedUpgrade?.rollbackSchemaCompatibility ??
		(await attestRollbackSchemaCompatibility({
			servicesToRestart: ["web", "worker"],
			containers: observedComposeServices,
			configuredImages: rollbackConfiguredImages,
			capture: runDockerCapture,
		}));
	let databaseBoundaryMayHaveAdvanced = interruptedUpgrade?.databaseBoundaryMayHaveAdvanced ?? false;
	const isDev = interruptedUpgrade?.isDevelopment ?? (await composeUsesBuild(composePath));
	if (isDev) {
		const developmentComposeContents = await fs.readFile(composePath, "utf8");
		await assertDevelopmentSourceVersion({
			composeContents: developmentComposeContents,
			configDir,
			targetVersion: cliVersion,
		});
		await assertRecoveryStateOutsideDevelopmentBuildContexts({
			composeContents: developmentComposeContents,
			configDir,
			recoveryPath: await recoveryFilePath(configDir),
		});
	}
	const ctx = buildMigrationContext(configDir);
	let previousConfig = interruptedUpgrade?.rollbackConfig ?? (await captureDeploymentConfig(configDir));
	let preparedImageRelease: ImageReleasePlan | undefined;
	let preparedTargetImageIds = interruptedUpgrade?.preparedTargetImageIds;
	let recoveryState = interruptedUpgrade;
	let cutoverLockIdentity = interruptedUpgrade?.cutoverLock;
	let cutoverLockAcquired = false;
	let sourceRuntimeFenceIdentities = [...(interruptedUpgrade?.sourceRuntimeFences ?? [])];
	const acquiredSourceRuntimeFences = new Set<string>();
	let databaseIdentityVerified = false;
	const markRecoveryPhase = async (
		phase: UpgradeRecoveryPhase,
		facts: {
			cutoverStarted?: boolean;
			databaseBoundaryMayHaveAdvanced?: boolean;
			applicationServicesQuiesced?: boolean;
			applicationContainersRemoved?: boolean;
		} = {},
	): Promise<void> => {
		if (!recoveryState) return;
		recoveryState = await writeUpgradeRecoveryState(
			configDir,
			advanceUpgradeRecoveryState(recoveryState, phase, facts),
		);
	};
	const checkpointPreparedTargetImages = async (candidate: PreparedTargetImageIds): Promise<void> => {
		const expected = recoveryState?.preparedTargetImageIds;
		if (expected) {
			preparedTargetImageIds = reconcilePreparedTargetImageIds(expected, candidate);
			return;
		}
		if (!recoveryState) throw new Error("Upgrade recovery checkpoint was not created");
		recoveryState = await writeUpgradeRecoveryState(configDir, {
			...recoveryState,
			preparedTargetImageIds: candidate,
		});
		preparedTargetImageIds = candidate;
	};
	const verifyPreparedDatabaseIdentity = async (): Promise<void> => {
		if (databaseIdentityVerified) return;
		if (!preparedTargetImageIds) throw new Error("Target image identities were not checkpointed");
		log.step("Verifying application and direct PostgreSQL endpoints...");
		await verifyDatabaseConnectionIdentity({
			configDir,
			migrationImageId: preparedTargetImageIds.dbMigrate,
			runCompose: (args) => runDockerCompose(configDir, args),
		});
		databaseIdentityVerified = true;
	};
	const requireCutoverLockInput = () => {
		if (!cutoverLockIdentity) throw new Error("Database cutover lock identity was not checkpointed");
		if (!preparedTargetImageIds) throw new Error("Target image identities were not checkpointed");
		return {
			identity: cutoverLockIdentity,
			targetVersion: cliVersion,
			migrationImageId: preparedTargetImageIds.dbMigrate,
		};
	};
	const assertDatabaseCutoverLock = async (): Promise<void> => {
		await assertUpgradeCutoverLockOwned({
			...requireCutoverLockInput(),
			capture: runDockerCapture,
		});
	};
	const requireSourceRuntimeFenceInput = (identity: (typeof sourceRuntimeFenceIdentities)[number]) => {
		if (!preparedTargetImageIds) throw new Error("Target image identities were not checkpointed");
		return {
			identity,
			targetVersion: cliVersion,
			migrationImageId: preparedTargetImageIds.dbMigrate,
		};
	};
	const assertSourceRuntimeFences = async (): Promise<void> => {
		for (const generation of sourceRuntimeFenceGenerations) {
			const identity = sourceRuntimeFenceIdentities.find(
				(candidate) => candidate.runtimeFenceGeneration === generation,
			);
			if (!identity) throw new Error(`Source runtime fence ${generation} was not checkpointed`);
			await assertUpgradeCutoverLockOwned({
				...requireSourceRuntimeFenceInput(identity),
				capture: runDockerCapture,
			});
		}
	};
	const assertAcquiredSourceRuntimeFences = async (): Promise<void> => {
		for (const identity of sourceRuntimeFenceIdentities) {
			if (!identity.runtimeFenceGeneration || !acquiredSourceRuntimeFences.has(identity.runtimeFenceGeneration))
				continue;
			await assertUpgradeCutoverLockOwned({
				...requireSourceRuntimeFenceInput(identity),
				capture: runDockerCapture,
			});
		}
	};
	const ensureSourceRuntimeFences = async (): Promise<void> => {
		if (sourceRuntimeFenceGenerations.length === 0) return;
		if (!recoveryState) throw new Error("Upgrade recovery checkpoint was not created");
		for (const generation of sourceRuntimeFenceGenerations) {
			if (acquiredSourceRuntimeFences.has(generation)) continue;
			let identity = sourceRuntimeFenceIdentities.find((candidate) => candidate.runtimeFenceGeneration === generation);
			if (!identity) {
				identity = await createSourceRuntimeFenceIdentity(configDir, generation);
				sourceRuntimeFenceIdentities = [...sourceRuntimeFenceIdentities, identity];
				recoveryState = await writeUpgradeRecoveryState(configDir, {
					...recoveryState,
					sourceRuntimeFences: sourceRuntimeFenceIdentities,
				});
			}
			log.step(`Fencing remaining ${generation} runtime writers...`);
			await acquireDatabaseCutoverLock({
				configDir,
				...requireSourceRuntimeFenceInput(identity),
				capture: runDockerCapture,
				run: runDocker,
				runCompose: (args) => runDockerCompose(configDir, args),
			});
			acquiredSourceRuntimeFences.add(generation);
		}
		await assertSourceRuntimeFences();
	};
	const ensureExclusiveRuntimeFence = async (generation: string): Promise<void> => {
		if (!recoveryState) throw new Error("Upgrade recovery checkpoint was not created");
		if (acquiredSourceRuntimeFences.has(generation)) return;
		let identity = sourceRuntimeFenceIdentities.find((candidate) => candidate.runtimeFenceGeneration === generation);
		if (!identity) {
			identity = await createSourceRuntimeFenceIdentity(configDir, generation);
			sourceRuntimeFenceIdentities = [...sourceRuntimeFenceIdentities, identity];
			recoveryState = await writeUpgradeRecoveryState(configDir, {
				...recoveryState,
				sourceRuntimeFences: sourceRuntimeFenceIdentities,
			});
		}
		log.step(`Fencing remaining ${generation} runtime writers...`);
		await acquireDatabaseCutoverLock({
			configDir,
			...requireSourceRuntimeFenceInput(identity),
			capture: runDockerCapture,
			run: runDocker,
			runCompose: (args) => runDockerCompose(configDir, args),
		});
		acquiredSourceRuntimeFences.add(generation);
		await assertAcquiredSourceRuntimeFences();
	};
	const setRuntimeGeneration = async (
		generation: string,
		expectedGeneration: string,
		allowMissingTable = false,
	): Promise<void> => {
		if (!preparedTargetImageIds) throw new Error("Target image identities were not checkpointed");
		await assertDatabaseCutoverLock();
		await assertAcquiredSourceRuntimeFences();
		await setDatabaseRuntimeGeneration({
			allowMissingTable,
			configDir,
			expectedGeneration,
			generation,
			migrationImageId: preparedTargetImageIds.dbMigrate,
			runCompose: (args) => runDockerCompose(configDir, args),
		});
		await assertDatabaseCutoverLock();
		await assertAcquiredSourceRuntimeFences();
	};
	const waitForLegacyRuntimeQuiescence = async (): Promise<void> => {
		await new Promise<void>((resolve) => setTimeout(resolve, LEGACY_RUNTIME_QUIESCENCE_MS));
		await assertDatabaseCutoverLock();
		assertServicesQuiescent(await getComposeServices(configDir), runningServices);
	};
	const assertDatabaseFences = async (): Promise<void> => {
		await assertDatabaseCutoverLock();
		await assertSourceRuntimeFences();
	};
	const releaseDatabaseCutoverLockAfterCompletion = async (allowMissing = false): Promise<void> => {
		if (!cutoverLockIdentity) {
			if (allowMissing) return;
			throw new Error("Database cutover lock identity was not checkpointed");
		}
		await releaseDatabaseCutoverLock({
			...requireCutoverLockInput(),
			capture: runDockerCapture,
			run: runDocker,
			allowMissing,
		});
		cutoverLockAcquired = false;
	};
	const releaseSourceRuntimeFences = async (allowMissing = false): Promise<void> => {
		for (const identity of [...sourceRuntimeFenceIdentities].reverse()) {
			if (
				!allowMissing &&
				(!identity.runtimeFenceGeneration || !acquiredSourceRuntimeFences.has(identity.runtimeFenceGeneration))
			) {
				continue;
			}
			await releaseDatabaseCutoverLock({
				...requireSourceRuntimeFenceInput(identity),
				capture: runDockerCapture,
				run: runDocker,
				allowMissing,
			});
			if (identity.runtimeFenceGeneration) acquiredSourceRuntimeFences.delete(identity.runtimeFenceGeneration);
		}
	};
	const stopTemporaryDatabaseDependencies = async (): Promise<void> => {
		if (!anyComposeServiceWasRunning) {
			await runDockerCompose(configDir, ["stop", "--timeout", "3900"]);
		}
	};
	const captureDevelopmentImageBackups = async (): Promise<DevelopmentImageBackup[]> => {
		const services = developmentElmoBuildServiceNames(previousConfig.compose.contents);
		const images = await Promise.all(
			services.map(async (service) => ({
				service,
				reference: parseComposeImageReference(
					service,
					await runDockerComposeCapture(configDir, ["config", "--images", service]),
				),
			})),
		);
		const currentContainers = await getComposeServices(configDir);
		return Promise.all(
			images.map(async ({ service, reference }) => {
				if (reference.includes("@") || reference.startsWith("sha256:")) {
					throw new Error(`Cannot preserve development image reference ${reference}`);
				}
				let currentImageId: string;
				try {
					currentImageId = await resolveDevelopmentBackupImageId({
						service,
						configuredReference: reference,
						containers: currentContainers,
						capture: runDockerCapture,
					});
				} catch (error) {
					throw new Error(
						`Cannot preserve the current ${service} image; build the current deployment before upgrading`,
						{ cause: error },
					);
				}
				return {
					service,
					imageId: currentImageId,
					originalReference: reference,
					backupReference: `elmo-upgrade-backup:${service}-${crypto.randomUUID()}`,
				};
			}),
		);
	};
	const restoreDevelopmentImages = async (): Promise<void> => {
		for (const backup of recoveryState?.developmentImages ?? []) {
			await runDocker(["image", "tag", backup.backupReference, backup.originalReference]);
		}
	};
	const removeDevelopmentImageBackups = async (): Promise<void> => {
		await Promise.all(
			(recoveryState?.developmentImages ?? []).map((backup) =>
				runDocker(["image", "rm", backup.backupReference]).catch(() => undefined),
			),
		);
	};
	const recreateApplicationContainersWithoutStarting = async (
		images: readonly Pick<RollbackRuntimeImage, "service" | "imageId">[],
	): Promise<void> => {
		if (images.length === 0) return;
		await runDockerCompose(configDir, [
			"up",
			"--no-start",
			"--no-deps",
			"--pull",
			"never",
			"--no-build",
			"--force-recreate",
			...applicationStartupOrder(images.map((image) => image.service)),
		]);
		await assertComposeServiceImageIds({
			images,
			containers: await getComposeServices(configDir),
			capture: runDockerCapture,
		});
	};
	const targetApplicationImages = (): Pick<RollbackRuntimeImage, "service" | "imageId">[] => {
		if (!preparedTargetImageIds) throw new Error("Target image identities were not checkpointed");
		const targetImageIds = preparedTargetImageIds;
		return existingApplicationServices.map((service) => ({
			service,
			imageId: targetImageIds[service],
		}));
	};
	const drainCurrentlyLiveApplicationContainers = async (): Promise<void> => {
		const currentContainers = await getComposeServices(configDir);
		const liveApplications = runningApplicationServiceNames(runningComposeServiceNames(currentContainers));
		if (liveApplications.length === 0) return;
		log.warn("Draining application containers before changing the cutover runtime...");
		await runDockerCompose(configDir, ["stop", "--timeout", "3900", ...liveApplications]);
		assertServicesQuiescent(await getComposeServices(configDir), liveApplications);
	};
	const removePreviousCutoverContainers = async (): Promise<void> => {
		if (runningServices.length > 0 && !recoveryState?.applicationServicesQuiesced) {
			throw new Error("Application containers were not durably recorded as quiescent before removal");
		}
		await drainCurrentlyLiveApplicationContainers();
		const currentContainers = await getComposeServices(configDir);
		const activeBaseMigrator = currentContainers.find(
			(service) =>
				service.Service === "db-migrate" &&
				(runningComposeServiceNames([service]).length > 0 || service.State.trim().toLowerCase().startsWith("created")),
		);
		if (activeBaseMigrator) {
			throw new Error(`Base database migrator remained ${activeBaseMigrator.State} at the cutover boundary`);
		}
		const servicesToRemove = [
			...new Set(
				currentContainers
					.map((service) => service.Service)
					.filter((service) => service === "web" || service === "worker" || service === "db-migrate"),
			),
		];
		if (servicesToRemove.length > 0) {
			await runDockerCompose(configDir, ["rm", "--force", ...servicesToRemove]);
		}
		const remaining = (await getComposeServices(configDir)).filter(
			(service) => service.Service === "web" || service.Service === "worker" || service.Service === "db-migrate",
		);
		if (remaining.length > 0) {
			throw new Error("Application or base migrator containers remain after the maintenance removal fence");
		}
		await markRecoveryPhase(recoveryState?.phase === "rolling-back" ? "rolling-back" : "applying-release", {
			cutoverStarted: true,
			applicationContainersRemoved: true,
		});
	};
	const rollbackImagesCoverExistingServices =
		rollbackImages !== undefined &&
		existingApplicationServices.every((service) => rollbackImages.some((image) => image.service === service));
	const targetRecoveryFenceRequired = (): boolean =>
		requiresTargetRecoveryFence({
			crossesSchemaBoundary,
			databaseBoundaryMayHaveAdvanced,
			rollbackSchemaCompatibility,
			rollbackImageIdsAvailable: rollbackImagesCoverExistingServices,
		});
	const completeUpgrade = async (allowMissingCutoverLock: boolean): Promise<void> => {
		await completeDeploymentUpgrade({
			releaseCutoverLock: async () => {
				if (acquiredSourceRuntimeFences.size > 0) await assertAcquiredSourceRuntimeFences();
				await releaseSourceRuntimeFences(allowMissingCutoverLock);
				if (cutoverLockAcquired) await assertDatabaseCutoverLock();
				await releaseDatabaseCutoverLockAfterCompletion(allowMissingCutoverLock);
			},
			stopTemporaryDependencies: stopTemporaryDatabaseDependencies,
			removeRecoveryState: () => removeUpgradeRecoveryState(configDir),
			removeImageBackups: removeDevelopmentImageBackups,
		});
	};
	try {
		await executeDeploymentUpgrade({
			wasRunning,
			requiresMaintenance,
			assertCanContinue: assertUpgradeNotInterrupted,
			cutoverAlreadyStarted: interruptedUpgrade?.cutoverStarted ?? false,
			runConfigMigrations: async () => {
				await runMigrations(plan, ctx);
				await reconcileCurrentConfig(ctx);
			},
			checkpointRelease: async () => {
				if (!recoveryState) {
					// Compatible config additions must survive rollback once target code can persist data with them.
					previousConfig = await captureDeploymentConfig(configDir);
					const now = new Date().toISOString();
					recoveryState = {
						formatVersion: 1,
						deploymentId,
						databaseFingerprint,
						targetVersion: cliVersion,
						detectedVersion,
						fromVersion,
						requiresMaintenance,
						isDevelopment: isDev,
						dockerEngine,
						previousRunningServices: runningServices,
						anyComposeServiceWasRunning,
						rollbackSchemaCompatibility,
						rollbackConfig: previousConfig,
						rollbackImages,
						legacySingleDeploymentAcknowledged,
						cutoverStarted: false,
						databaseBoundaryMayHaveAdvanced: false,
						applicationServicesQuiesced: false,
						applicationContainersRemoved: false,
						phase: "config-checkpointed",
						createdAt: now,
						updatedAt: now,
					};
				}
				await markRecoveryPhase("config-checkpointed");
			},
			prepareRelease: async () => {
				await markRecoveryPhase("preparing-release");
				if (!isDev) preparedImageRelease = planImageRelease(previousConfig.compose.contents, cliVersion);
				if (isDev) {
					let developmentImages = recoveryState?.developmentImages;
					if (!developmentImages) {
						developmentImages = await captureDevelopmentImageBackups();
						if (!recoveryState) throw new Error("Upgrade recovery checkpoint was not created");
						recoveryState = await writeUpgradeRecoveryState(configDir, {
							...recoveryState,
							developmentImages,
						});
					}
					for (const backup of developmentImages) {
						await runDocker(["image", "tag", backup.imageId, backup.backupReference]);
					}
				}
				if (recoveryState?.preparedTargetImageIds) {
					const stored = await requireSchemaCompatibleImages({
						images: recoveryState.preparedTargetImageIds,
						expectedReleaseVersion: cliVersion,
						expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
						capture: runDockerCapture,
					});
					await checkpointPreparedTargetImages(stored);
					let targetReferences: Partial<Record<keyof PreparedTargetImageIds, string>>;
					if (isDev) {
						targetReferences = {
							web: parseComposeImageReference(
								"web",
								await runDockerComposeCapture(configDir, ["config", "--images", "web"]),
							),
							worker: parseComposeImageReference(
								"worker",
								await runDockerComposeCapture(configDir, ["config", "--images", "worker"]),
							),
							...(developmentElmoBuildServiceNames(previousConfig.compose.contents).includes("db-migrate")
								? {
										dbMigrate: parseComposeImageReference(
											"db-migrate",
											await runDockerComposeCapture(configDir, ["config", "--images", "db-migrate"]),
										),
									}
								: {}),
						};
					} else {
						if (!preparedImageRelease) throw new Error("Target image release was not planned");
						targetReferences = preparedImageRelease.images;
					}
					for (const service of ["dbMigrate", "web", "worker"] as const) {
						const reference = targetReferences?.[service];
						if (reference) await runDocker(["image", "tag", stored[service], reference]);
					}
					await verifyPreparedDatabaseIdentity();
					await markRecoveryPhase("release-prepared");
					return;
				}
				if (isDev) {
					log.step("Building target web, worker, and migrator images while the current services stay online...");
					const applicationBuildServices = developmentElmoBuildServiceNames(previousConfig.compose.contents);
					await runDockerCompose(configDir, [
						"build",
						"--build-arg",
						`ELMO_RELEASE_VERSION=${cliVersion}`,
						...applicationBuildServices,
					]);
					const migrationImage = applicationBuildServices.includes("db-migrate")
						? parseComposeImageReference(
								"db-migrate",
								await runDockerComposeCapture(configDir, ["config", "--images", "db-migrate"]),
							)
						: parseComposeImageReference(
								UPGRADE_MIGRATOR_SERVICE_NAME,
								await prepareTargetDevelopmentMigrationImage({
									configDir,
									version: cliVersion,
									captureCompose: (args) => runDockerComposeCapture(configDir, args),
									runCompose: (args) => runDockerCompose(configDir, args),
								}),
							);
					await checkpointPreparedTargetImages(
						await requireSchemaCompatibleImages({
							images: {
								dbMigrate: migrationImage,
								web: parseComposeImageReference(
									"web",
									await runDockerComposeCapture(configDir, ["config", "--images", "web"]),
								),
								worker: parseComposeImageReference(
									"worker",
									await runDockerComposeCapture(configDir, ["config", "--images", "worker"]),
								),
							},
							expectedReleaseVersion: cliVersion,
							expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
							capture: runDockerCapture,
						}),
					);
				} else {
					if (!preparedImageRelease) throw new Error("Target image release was not planned");
					const images = Object.values(preparedImageRelease.images);
					log.step(`Pulling ${images.length} target image${images.length === 1 ? "" : "s"} before cutover...`);
					await Promise.all(images.map((image) => runDocker(["pull", image])));
					await checkpointPreparedTargetImages(
						await requireSchemaCompatibleImages({
							images: preparedImageRelease.images,
							expectedReleaseVersion: cliVersion,
							expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
							capture: runDockerCapture,
						}),
					);
				}
				await verifyPreparedDatabaseIdentity();
				await markRecoveryPhase("release-prepared");
			},
			acquireCutoverLock: async () => {
				if (!preparedTargetImageIds) throw new Error("Target image identities were not checkpointed");
				if (!recoveryState) throw new Error("Upgrade recovery checkpoint was not created");
				if (!cutoverLockIdentity) {
					cutoverLockIdentity = await createUpgradeCutoverLockIdentity(configDir);
					recoveryState = await writeUpgradeRecoveryState(configDir, {
						...recoveryState,
						cutoverLock: cutoverLockIdentity,
					});
				}
				log.step("Acquiring the database deployment cutover lock...");
				await acquireDatabaseCutoverLock({
					configDir,
					...requireCutoverLockInput(),
					capture: runDockerCapture,
					run: runDocker,
					runCompose: (args) => runDockerCompose(configDir, args),
				});
				cutoverLockAcquired = true;
				await assertDatabaseCutoverLock();
			},
			runDatabaseMigration: async () => {
				await ensureSourceRuntimeFences();
				await assertDatabaseFences();
				if (!preparedTargetImageIds) throw new Error("Target image identities were not checkpointed");
				const migrationImageId = preparedTargetImageIds.dbMigrate;
				if (crossesSchemaBoundary) {
					const boundaryContainers = (await getComposeServices(configDir)).filter(
						(service) => service.Service === "web" || service.Service === "worker" || service.Service === "db-migrate",
					);
					if (boundaryContainers.length > 0) {
						throw new Error("Refusing schema migration while application or base migrator containers still exist");
					}
				}
				await markRecoveryPhase("migrating-database", {
					databaseBoundaryMayHaveAdvanced: crossesSchemaBoundary,
				});
				if (crossesSchemaBoundary) databaseBoundaryMayHaveAdvanced = true;
				log.step("Applying database migrations...");
				await runTargetDatabaseMigration({
					configDir,
					dev: isDev,
					version: cliVersion,
					migrationImage: migrationImageId,
					wasRunning: anyComposeServiceWasRunning,
					preserveDependencies: true,
					imagePrepared: true,
					recoverExistingMigration: (identity) =>
						recoveredMigratorBeforeReplay
							? Promise.resolve(true)
							: recoverExistingUpgradeMigrator({
									identity,
									expectedImageId: migrationImageId,
									targetVersion: cliVersion,
									capture: runDockerCapture,
									run: runDocker,
								}),
					runCompose: (args) => runDockerCompose(configDir, args),
				});
				if (crossesSchemaBoundary) {
					await setRuntimeGeneration(CLOUD_SCHEMA_COMPATIBILITY, "pre-0020");
				}
				await assertDatabaseFences();
				if (requiresMaintenance) {
					await recreateApplicationContainersWithoutStarting(targetApplicationImages());
				}
				await markRecoveryPhase("database-migrated");
			},
			stopServices: async () => {
				await assertDatabaseCutoverLock();
				await markRecoveryPhase("stopping-services", {
					cutoverStarted: true,
					databaseBoundaryMayHaveAdvanced: crossesSchemaBoundary,
				});
				if (crossesSchemaBoundary) databaseBoundaryMayHaveAdvanced = true;
				if (recoveryState?.applicationServicesQuiesced) {
					if (recoveryState.applicationContainersRemoved) {
						if (legacyLocalExternalException) await waitForLegacyRuntimeQuiescence();
						await ensureSourceRuntimeFences();
						await markRecoveryPhase("services-stopped");
						return;
					}
					const remainingContainers = await getComposeServices(configDir);
					const remainingServices = runningServices.filter((required) =>
						remainingContainers.some((service) => service.Service === required),
					);
					if (remainingServices.length > 0) {
						assertServicesQuiescent(remainingContainers, remainingServices);
					}
					if (legacyLocalExternalException) await waitForLegacyRuntimeQuiescence();
					await ensureSourceRuntimeFences();
					await markRecoveryPhase("services-stopped");
					return;
				}
				log.step(`Stopping ${runningServices.join(" and ")}; the worker may drain active jobs for up to one hour...`);
				await runDockerCompose(
					configDir,
					legacyLocalExternalException
						? ["stop", "--timeout", "3900"]
						: ["stop", "--timeout", "3900", ...runningServices],
				);
				assertServicesQuiescent(await getComposeServices(configDir), runningServices);
				await assertDatabaseCutoverLock();
				await markRecoveryPhase("services-stopped", { applicationServicesQuiesced: true });
				if (legacyLocalExternalException) await waitForLegacyRuntimeQuiescence();
				await ensureSourceRuntimeFences();
			},
			applyRelease: async () => {
				await ensureSourceRuntimeFences();
				await assertDatabaseFences();
				await markRecoveryPhase("applying-release", {
					cutoverStarted: true,
					databaseBoundaryMayHaveAdvanced: crossesSchemaBoundary,
				});
				if (crossesSchemaBoundary) databaseBoundaryMayHaveAdvanced = true;
				if (!isDev && !preparedImageRelease) throw new Error("Target image release was not prepared");
				await removePreviousCutoverContainers();
				await applyDeploymentRelease(
					configDir,
					previousConfig,
					cliVersion,
					preparedImageRelease?.composeContents ?? previousConfig.compose.contents,
				);
				if (!requiresMaintenance) {
					await recreateApplicationContainersWithoutStarting(targetApplicationImages());
				}
				await assertDatabaseFences();
				await markRecoveryPhase("release-applied");
				log.success(`Pinned config to ${cliVersion}.`);
			},
			startServices: async () => {
				await assertDatabaseFences();
				await markRecoveryPhase("starting-services");
				log.step("Starting services...");
				await startServicesAndWait(configDir, runningServices, {
					preparedImages: true,
					noDependencies: true,
					useExistingContainers: true,
				});
				await assertDatabaseFences();
				await markRecoveryPhase("services-started");
			},
			verifyServices: async () => {
				await assertDatabaseFences();
				if (!preparedTargetImageIds) throw new Error("Target image identities were not checkpointed");
				await markRecoveryPhase("verifying-services");
				await assertServicesReady(configDir, runningServices);
				const targetCompatibility = await attestRollbackSchemaCompatibility({
					servicesToRestart: runningServices,
					containers: await getComposeServices(configDir),
					expectedReleaseVersion: cliVersion,
					expectedRuntimeFenceGeneration: CLOUD_SCHEMA_COMPATIBILITY,
					expectedImageIds: {
						web: preparedTargetImageIds.web,
						worker: preparedTargetImageIds.worker,
					},
					capture: runDockerCapture,
				});
				if (targetCompatibility !== CLOUD_SCHEMA_COMPATIBILITY) {
					throw new Error(`Running target services do not attest schema compatibility ${CLOUD_SCHEMA_COMPATIBILITY}`);
				}
				await assertDatabaseFences();
			},
			rollbackRelease: async ({ restartServices }) => {
				if (cutoverLockAcquired) await assertDatabaseCutoverLock();
				if (acquiredSourceRuntimeFences.size > 0) await assertAcquiredSourceRuntimeFences();
				if (targetRecoveryFenceRequired()) {
					if (!shutdownSignal) {
						await drainCurrentlyLiveApplicationContainers().catch(() => undefined);
					}
					throw new TargetRecoveryFenceError(
						`Database schema ${CLOUD_SCHEMA_COMPATIBILITY} may be applied; the previous runtime lacks the required compatibility attestation, so it was not restored. Resume the target release or use the rehearsed compatibility image.`,
					);
				}
				assertUpgradeNotInterrupted();
				await markRecoveryPhase("rolling-back").catch(() => undefined);
				if (recoveryState?.cutoverStarted && !cutoverLockAcquired) {
					throw new TargetRecoveryFenceError(
						"The database cutover lock could not be recovered, so the interrupted release was not rolled back.",
					);
				}
				if (recoveryState?.cutoverStarted && !rollbackImagesCoverExistingServices) {
					throw new TargetRecoveryFenceError(
						"Exact pre-upgrade application images were not checkpointed, so the previous runtime was not recreated.",
					);
				}
				if (recoveryState?.cutoverStarted && rollbackImages) {
					await assertDatabaseFences();
					await restoreRollbackRuntimeImages({
						images: rollbackImages,
						capture: runDockerCapture,
						run: runDocker,
					});
					await drainCurrentlyLiveApplicationContainers();
					await removePreviousCutoverContainers();
				}
				if (crossesSchemaBoundary && databaseBoundaryMayHaveAdvanced) {
					await ensureExclusiveRuntimeFence(CLOUD_SCHEMA_COMPATIBILITY);
					await setRuntimeGeneration("pre-0020", CLOUD_SCHEMA_COMPATIBILITY, true);
				}
				if (cutoverLockAcquired) await assertDatabaseCutoverLock();
				if (acquiredSourceRuntimeFences.size > 0) await assertAcquiredSourceRuntimeFences();
				await restoreDeploymentConfig(configDir, previousConfig);
				if (isDev) await restoreDevelopmentImages();
				if (recoveryState?.cutoverStarted && rollbackImages) {
					await restoreRollbackRuntimeImages({
						images: rollbackImages,
						capture: runDockerCapture,
						run: runDocker,
					});
					await recreateApplicationContainersWithoutStarting(rollbackImages);
				}
				if (restartServices) {
					if (acquiredSourceRuntimeFences.size > 0) await releaseSourceRuntimeFences();
					else if (sourceRuntimeFenceIdentities.length > 0) await releaseSourceRuntimeFences(true);
					if (cutoverLockAcquired) await assertDatabaseCutoverLock();
					log.warn("Target cutover failed; restarting the previous release...");
					await startServicesAndWait(configDir, runningServices, {
						preparedImages: true,
						noDependencies: true,
						useExistingContainers: true,
					});
					await assertServicesReady(configDir, runningServices);
					if (crossesSchemaBoundary) {
						const expectedRollbackImageIds = Object.fromEntries(
							(rollbackImages ?? []).map((image) => [image.service, image.imageId]),
						);
						const rollbackAttestation = await attestRollbackSchemaCompatibility({
							servicesToRestart: runningServices,
							containers: await getComposeServices(configDir),
							configuredImages: Object.fromEntries(
								(rollbackImages ?? []).map((image) => [image.service, image.reference]),
							),
							expectedImageIds: expectedRollbackImageIds,
							capture: runDockerCapture,
						});
						if (rollbackAttestation !== CLOUD_SCHEMA_COMPATIBILITY) {
							throw new TargetRecoveryFenceError(
								"The recreated rollback runtime did not re-attest schema compatibility; stop it and resume the target release.",
							);
						}
					}
				}
				await completeUpgrade(true);
			},
		});
		await completeUpgrade(false);
	} catch (error) {
		if (error instanceof DeploymentUpgradeError) {
			const label = error.phase === "database-migration" ? "Database migration" : "Upgrade";
			log.error(`${label} failed: ${error.message}`);
			if (error.rolledBack) {
				log.info("The previous config was restored; services stopped for cutover were restarted.");
			}
			if (error.rollbackCause) {
				log.error(
					`Automatic rollback also failed: ${error.rollbackCause instanceof Error ? error.rollbackCause.message : String(error.rollbackCause)}`,
				);
				if (
					requiresHardRecoveryGuidance({
						crossesSchemaBoundary,
						databaseBoundaryMayHaveAdvanced,
						targetRecoveryFenceRequired: targetRecoveryFenceRequired(),
						rollbackCause: error.rollbackCause,
					})
				) {
					log.info(
						"Do not restore or start the old config. Keep the maintenance window open; resume the target release with this CLI version or deploy the rehearsed 0020 compatibility images.",
					);
				} else {
					log.info(
						"Keep the maintenance window open and restore the saved deployment config before restarting services.",
					);
				}
				log.info(`Recovery state remains at ${await recoveryFilePath(configDir)}.`);
			}
		} else {
			log.error(`Upgrade failed: ${error instanceof Error ? error.message : String(error)}`);
			if (await readUpgradeRecoveryState(configDir).catch(() => null)) {
				log.info(`Recovery state remains at ${await recoveryFilePath(configDir)}.`);
			}
		}
		if (!process.exitCode) process.exitCode = 1;
		return;
	}

	if (!wasRunning) {
		log.info("Stack was stopped before upgrade — leaving it stopped. Start with `elmo compose up -d`.");
	}

	await trackCliEvent(configDir, "cli_upgrade", {
		from_version: fromVersion,
		to_version: cliVersion,
		migrations_run: plan.length,
		was_running: wasRunning,
		dev_mode: isDev,
	});

	p.outro(pc.green(`Upgraded to ${cliVersion}.`));
}

async function getRunningComposeServices(configDir: string): Promise<string[]> {
	return runningComposeServiceNames(await getComposeServices(configDir));
}

// Reads the version recorded in a `# Rendered by elmo <version> on ...` header.
async function readRenderedVersion(filePath: string): Promise<string | null> {
	try {
		return parseRenderedVersion(await fs.readFile(filePath, "utf8"));
	} catch {
		return null;
	}
}

async function composeUsesBuild(composePath: string): Promise<boolean> {
	return usesDevelopmentElmoBuild(await fs.readFile(composePath, "utf8"));
}

function buildMigrationContext(configDir: string): MigrationContext {
	const envPath = path.join(configDir, ".env");
	return {
		configDir,
		log: {
			info: (msg) => log.info(msg),
			warn: (msg) => log.warn(msg),
			step: (msg) => log.step(msg),
		},
		readEnv: async () => {
			try {
				return parseDotenv(await fs.readFile(envPath, "utf8"));
			} catch {
				return {};
			}
		},
		setEnv: (name, value) => setEnvFileValue(envPath, name, value),
	};
}

async function ensureUpgradeDatabaseConnectionContract(configDir: string): Promise<void> {
	const envPath = path.join(configDir, ".env");
	const env = parseDotenv(await fs.readFile(envPath, "utf8"));
	if (env.DATABASE_URL_UNPOOLED?.trim()) {
		assertSessionAffineDatabaseUrl(env.DATABASE_URL_UNPOOLED);
		return;
	}

	const managedPostgres = await isCliManagedLocalPostgres(configDir);
	if (!managedPostgres || !env.DATABASE_URL) {
		throw new Error(
			"DATABASE_URL_UNPOOLED is required before upgrading an external or white-label deployment. Configure the provider's direct, session-affine PostgreSQL endpoint; do not use a transaction pooler.",
		);
	}

	assertSessionAffineDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");
	await setEnvFileValue(envPath, "DATABASE_URL_UNPOOLED", env.DATABASE_URL);
	log.info("Added DATABASE_URL_UNPOOLED for the CLI-managed local PostgreSQL service.");
}

async function isCliManagedLocalPostgres(configDir: string): Promise<boolean> {
	const env = parseDotenv(await fs.readFile(path.join(configDir, ".env"), "utf8"));
	const composeDocument: unknown = parseYaml(await fs.readFile(path.join(configDir, "elmo.yaml"), "utf8"), {
		merge: true,
	});
	const services =
		typeof composeDocument === "object" && composeDocument !== null && "services" in composeDocument
			? composeDocument.services
			: undefined;
	const postgresService =
		typeof services === "object" && services !== null && "postgres" in services ? services.postgres : undefined;
	return (
		env.DEPLOYMENT_MODE === "local" &&
		isCliManagedLocalPostgresDatabaseUrl(env.DATABASE_URL) &&
		typeof postgresService === "object" &&
		postgresService !== null &&
		"image" in postgresService &&
		postgresService.image === "postgres:16-alpine" &&
		!("build" in postgresService) &&
		!("entrypoint" in postgresService) &&
		!("command" in postgresService)
	);
}

async function ensureUpgradeDeploymentId(configDir: string): Promise<string> {
	const envPath = path.join(configDir, ".env");
	const existing = parseDotenv(await fs.readFile(envPath, "utf8")).DEPLOYMENT_ID?.trim();
	if (existing) return existing;
	const deploymentId = crypto.randomUUID();
	await setEnvFileValue(envPath, "DEPLOYMENT_ID", deploymentId);
	log.info("Added a stable DEPLOYMENT_ID for resumable upgrade safety.");
	return deploymentId;
}

// ── Docker Helpers ───────────────────────────────────────────────────────────

async function getComposeServices(configDir: string): Promise<ComposeService[]> {
	const output = await runDockerComposeCapture(configDir, ["ps", "--all", "--format", "json"]);
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
			throw new Error("Unable to parse docker compose status");
		}
	}
}

async function assertServicesReady(configDir: string, requiredServices: readonly string[]): Promise<void> {
	assertApplicationServicesHealthy(await getComposeServices(configDir), requiredServices);
}

async function startServicesAndWait(
	configDir: string,
	services: readonly string[],
	options: {
		noDependencies?: boolean;
		preparedImages?: boolean;
		useExistingContainers?: boolean;
	} = {},
): Promise<void> {
	for (const service of applicationStartupOrder(services)) {
		await runDockerCompose(configDir, [
			"up",
			"-d",
			...(options.noDependencies ? ["--no-deps"] : []),
			...(options.preparedImages ? ["--pull", "never", "--no-build"] : []),
			...(options.useExistingContainers ? ["--no-recreate"] : []),
			"--wait",
			"--wait-timeout",
			"180",
			service,
		]);
	}
}

function runDocker(args: string[]): Promise<void> {
	assertUpgradeNotInterrupted();
	return new Promise((resolve, reject) => {
		const child = spawn("docker", args, { stdio: "inherit" });
		trackDockerChild(child);
		let settled = false;
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			reject(error);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			if (code === 0) resolve();
			else reject(new Error(`docker ${args[0] ?? "command"} exited with code ${code}`));
		});
	});
}

function runDockerCapture(args: string[]): Promise<string> {
	assertUpgradeNotInterrupted();
	return new Promise((resolve, reject) => {
		const child = spawn("docker", args);
		trackDockerChild(child);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve(stdout);
			else reject(new Error(stderr.trim() || `docker ${args[0] ?? "command"} exited with code ${code}`));
		});
	});
}

function runDockerCompose(configDir: string, args: string[]): Promise<void> {
	assertUpgradeNotInterrupted();
	return new Promise((resolve, reject) => {
		const composeFile = path.join(configDir, "elmo.yaml");
		const envFile = path.join(configDir, ".env");
		const commandArgs = ["compose", "--env-file", envFile, "-f", composeFile, ...args];
		const child = spawn("docker", commandArgs, {
			stdio: "inherit",
		});
		trackDockerChild(child);
		let settled = false;
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			reject(error);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`docker compose exited with code ${code}`));
			}
		});
	});
}

function runDockerComposeCapture(configDir: string, args: string[]): Promise<string> {
	assertUpgradeNotInterrupted();
	return new Promise((resolve, reject) => {
		const composeFile = path.join(configDir, "elmo.yaml");
		const envFile = path.join(configDir, ".env");
		const commandArgs = ["compose", "--env-file", envFile, "-f", composeFile, ...args];
		const child = spawn("docker", commandArgs);
		trackDockerChild(child);
		let stdout = "";
		let stderr = "";
		let settled = false;
		child.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			reject(error);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(stderr || `docker compose exited with code ${code}`));
			}
		});
	});
}

async function assertDockerRunning(): Promise<void> {
	try {
		await runDockerCapture(["info"]);
	} catch (error) {
		throw new Error("Docker does not appear to be running. Start Docker and try again.");
	}
}

async function assertDockerComposeSupported(): Promise<void> {
	assertSupportedDockerComposeVersion(await runDockerCapture(["compose", "version", "--short"]));
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
		throw new Error(`Dockerfile not found in ${resolved}. Provide the directory that contains Dockerfile.`);
	}

	return fs.realpath(resolved);
}

// ── Config Dir Resolution ────────────────────────────────────────────────────

async function resolveConfigDir(explicitDir?: string): Promise<string> {
	const resolved = explicitDir ? path.resolve(process.cwd(), explicitDir) : CONFIG_HOME;
	const composePath = path.join(resolved, "elmo.yaml");
	if (!(await fileExists(composePath))) {
		if (explicitDir) {
			throw new Error(
				`Config directory does not contain elmo.yaml: ${resolved}\nRun \`elmo init --dir ${explicitDir}\` to create it.`,
			);
		}
		throw new Error(`No config found at ${resolved}. Run \`elmo init\` to create one, or specify --dir.`);
	}
	return resolved;
}

// ── File & Config Helpers ────────────────────────────────────────────────────

async function writeConfigFiles(
	configDir: string,
	initConfig: {
		env: EnvMap;
		composeYaml: string;
		postgresMode: PostgresMode;
		dev: boolean;
		version: string;
	},
): Promise<void> {
	const envPath = path.join(configDir, ".env");
	const composePath = path.join(configDir, "elmo.yaml");

	await ensureDir(configDir);
	await fs.writeFile(envPath, buildEnvFile(initConfig.env, initConfig.version), "utf8");
	await fs.writeFile(composePath, initConfig.composeYaml, "utf8");
}

function buildEnvFile(env: EnvMap, version: string): string {
	const lines = [renderedByHeader(version), "# WARNING: contains secrets. Do not commit.", ""];

	for (const [key, rawValue] of Object.entries(env)) {
		if (rawValue === undefined) {
			continue;
		}
		lines.push(`${key}=${formatEnvValue(rawValue)}`);
	}

	return `${lines.join("\n")}\n`;
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

async function fetchLatestCliVersion(): Promise<string | null> {
	try {
		const response = await fetch("https://registry.npmjs.org/@elmohq/cli/latest");
		if (!response.ok) {
			return null;
		}
		const data = (await response.json()) as { version?: string };
		return data.version ?? null;
	} catch {
		return null;
	}
}

async function maybeNotifyNewVersion(currentVersion: string): Promise<void> {
	const latest = await fetchLatestCliVersion();
	if (!latest) {
		return;
	}
	if (semver.valid(currentVersion) && semver.lt(currentVersion, latest)) {
		log.warn(`New CLI version available (${latest}). Run: npm install -g @elmohq/cli@latest`);
	}
}

// ── Entry Point ──────────────────────────────────────────────────────────────

main().catch((error) => {
	if (error instanceof CommandCancelledError) return;
	const msg = error instanceof Error ? error.message : String(error);
	console.error(`\n${pc.red("Error:")} ${msg}`);
	if (!process.exitCode) process.exitCode = 1;
});
