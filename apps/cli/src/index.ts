#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import * as p from "@clack/prompts";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import semver from "semver";
import { fileURLToPath } from "node:url";
import { trackCliEvent } from "./telemetry.js";

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
const DEFAULT_ORG_ID = "default";
const DEFAULT_ORG_NAME = "Default Organization";
const DEFAULT_APP_NAME = "Elmo";
const DEFAULT_APP_ICON = "/icons/elmo-icon.svg";
const DEFAULT_APP_URL = "http://localhost:1515";
const LOCAL_DATABASE_URL = "postgres://postgres:postgres@postgres:5432/elmo";

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
	info: (msg: string) =>
		isCI() ? console.log(msg) : p.log.info(msg),
	warn: (msg: string) =>
		isCI() ? console.warn(pc.yellow(msg)) : p.log.warn(msg),
	error: (msg: string) =>
		isCI() ? console.error(pc.red(msg)) : p.log.error(msg),
	success: (msg: string) =>
		isCI() ? console.log(pc.green(msg)) : p.log.success(msg),
	step: (msg: string) =>
		isCI() ? console.log(msg) : p.log.step(msg),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function assertNotCancelled<T>(value: T | symbol): asserts value is T {
	if (p.isCancel(value)) {
		p.cancel("Setup cancelled.");
		process.exit(0);
	}
}

function isCI(): boolean {
	return Boolean(process.env.ELMO_CI);
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
		.option(
			"--docker-dir <path>",
			"Path to Docker build context (dev mode)",
		)
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
			await withVersionCheck(version, () =>
				runCompose(args, options),
			);
		});

	program
		.command("logs")
		.description("view Elmo instance logs")
		.allowUnknownOption(true)
		.option("--dir <path>", "Config directory")
		.argument("[args...]", "Arguments passed to Docker Compose logs")
		.action(async (args: string[], options: DirOption) => {
			await withVersionCheck(version, () =>
				runCompose(["logs", ...args], options),
			);
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

	await program.parseAsync(process.argv);
}

async function withVersionCheck(
	version: string,
	fn: () => Promise<void>,
): Promise<void> {
	const notifyPromise = maybeNotifyNewVersion(version);
	await fn();
	await notifyPromise.catch(() => undefined);
}

// ── Command: init ────────────────────────────────────────────────────────────

async function runInit(options: InitOptions, version: string): Promise<void> {
	printBanner();

	if (isCI()) {
		await runInitCI(options, version);
		return;
	}

	await runInitInteractive(options, version);
}

async function runInitInteractive(options: InitOptions, version: string): Promise<void> {
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
			p.log.warn(
				`A .env file already exists in ${configDir} and was NOT created by Elmo.`,
			);
			const overwrite = await p.confirm({
				message:
					"Overwrite the existing .env file? This cannot be undone.",
				initialValue: false,
			});
			assertNotCancelled(overwrite);
			if (!overwrite) {
				p.cancel(
					"Setup cancelled. Choose a different directory with --dir.",
				);
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
			if (
				!(await fileExists(path.join(dockerDir, "Dockerfile")))
			) {
				p.log.error(
					`Dockerfile not found in ${dockerDir}`,
				);
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
	env.BETTER_AUTH_SECRET = generateSecret();
	env.DEFAULT_ORG_ID = DEFAULT_ORG_ID;
	env.DEFAULT_ORG_NAME = DEFAULT_ORG_NAME;
	env.APP_NAME = DEFAULT_APP_NAME;
	env.APP_ICON = DEFAULT_APP_ICON;
	env.APP_URL = DEFAULT_APP_URL;
	env.VITE_APP_NAME = DEFAULT_APP_NAME;
	env.VITE_APP_ICON = DEFAULT_APP_ICON;
	env.VITE_APP_URL = DEFAULT_APP_URL;

	if (postgresMode === "external") {
		const url = await p.text({
			message: "DATABASE_URL",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(url);
		env.DATABASE_URL = url;
	} else {
		env.DATABASE_URL = LOCAL_DATABASE_URL;
	}

	// ── AI providers ─────────────────────────────────────────────────────
	const setOpenai = await p.confirm({
		message: "Set OpenAI credentials?",
		initialValue: true,
	});
	assertNotCancelled(setOpenai);
	if (setOpenai) {
		const key = await p.text({
			message: "OPENAI_API_KEY",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.OPENAI_API_KEY = key;
	}

	const setAnthropic = await p.confirm({
		message: "Set Anthropic credentials?",
		initialValue: true,
	});
	assertNotCancelled(setAnthropic);
	if (setAnthropic) {
		const key = await p.text({
			message: "ANTHROPIC_API_KEY",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(key);
		env.ANTHROPIC_API_KEY = key;
	}

	const setDataforseo = await p.confirm({
		message: "Set DataForSEO credentials?",
		initialValue: false,
	});
	assertNotCancelled(setDataforseo);
	if (setDataforseo) {
		const login = await p.text({
			message: "DATAFORSEO_LOGIN",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(login);
		env.DATAFORSEO_LOGIN = login;

		const pwd = await p.text({
			message: "DATAFORSEO_PASSWORD",
			validate: (v) => (!v ? "Required" : undefined),
		});
		assertNotCancelled(pwd);
		env.DATAFORSEO_PASSWORD = pwd;
	}

	// ── Scrape targets ──────────────────────────────────────────────────
	// Default based on which API keys were provided
	const defaultTargets = [
		env.OPENAI_API_KEY ? "chatgpt:openai-api:gpt-5-mini:online" : null,
		env.ANTHROPIC_API_KEY ? "claude:anthropic-api:claude-sonnet-4" : null,
		env.DATAFORSEO_LOGIN ? "google-ai-mode:dataforseo:online" : null,
	].filter(Boolean).join(",");

	const scrapeTargets = await p.text({
		message: "SCRAPE_TARGETS (model:provider[:version][:online], comma-separated)",
		initialValue: defaultTargets || undefined,
		placeholder: "chatgpt:openai-api:gpt-5-mini:online,claude:anthropic-api:claude-sonnet-4,google-ai-mode:dataforseo:online",
		validate: (v) => (!v ? "Required" : undefined),
	});
	assertNotCancelled(scrapeTargets);
	env.SCRAPE_TARGETS = scrapeTargets;

	// ── Product updates ─────────────────────────────────────────────────
	const updatesEmail = await p.text({
		message: "Enter your email to receive product updates (optional)",
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
	p.log.warn(
		"Your .env contains secrets — do not commit it to version control.",
	);

	if (options.dev) {
		p.log.info(
			"Dev mode enabled. Run `elmo compose build` before starting.",
		);
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

	// Fire telemetry in the background — never blocks the CLI
	await trackCliEvent(
		"cli_init",
		{
			version,
			os: process.platform,
			arch: process.arch,
			node_version: process.version,
			postgres_mode: postgresMode,
			dev_mode: Boolean(options.dev),
		},
		email ? { $email: email, wants_updates: true } : undefined,
	);

	p.log.message(
		`If you find Elmo useful, star us on GitHub!\n  ${link(pc.cyan("https://github.com/elmohq/elmo"), "https://github.com/elmohq/elmo")}`,
	);

	p.outro(pc.green("Setup complete!"));
}

async function runInitCI(options: InitOptions, version: string): Promise<void> {
	const cwd = process.cwd();

	// Resolve config directory — --dir flag or ELMO_CONFIG_DIR or cwd
	const dirArg =
		options.dir ?? process.env.ELMO_CONFIG_DIR ?? cwd;
	const configDir = path.resolve(cwd, dirArg);

	// Resolve docker directory for dev mode
	let dockerDir: string | undefined;
	let repoRoot: string;

	if (options.dev) {
		const explicitDockerDir =
			options.dockerDir ?? process.env.ELMO_DOCKER_DIR;
		dockerDir = await resolveDockerDirAuto(cwd, explicitDockerDir);
		repoRoot = path.resolve(dockerDir, "..");
	} else {
		repoRoot = cwd;
	}

	// Build env from defaults and env vars
	const postgresMode: PostgresMode =
		(process.env.ELMO_POSTGRES_MODE as PostgresMode) ?? "docker";

	const env: EnvMap = {};
	env.DEPLOYMENT_MODE = "local";
	env.VITE_DEPLOYMENT_MODE = "local";
	env.BETTER_AUTH_SECRET = generateSecret();
	env.DEFAULT_ORG_ID = DEFAULT_ORG_ID;
	env.DEFAULT_ORG_NAME = DEFAULT_ORG_NAME;
	env.APP_NAME = DEFAULT_APP_NAME;
	env.APP_ICON = DEFAULT_APP_ICON;
	env.APP_URL = DEFAULT_APP_URL;
	env.VITE_APP_NAME = DEFAULT_APP_NAME;
	env.VITE_APP_ICON = DEFAULT_APP_ICON;
	env.VITE_APP_URL = DEFAULT_APP_URL;

	if (postgresMode === "external") {
		env.DATABASE_URL = process.env.ELMO_DATABASE_URL ?? "";
	} else {
		env.DATABASE_URL = LOCAL_DATABASE_URL;
	}

	// AI providers from env vars
	if (process.env.ELMO_OPENAI_API_KEY) {
		env.OPENAI_API_KEY = process.env.ELMO_OPENAI_API_KEY;
	}
	if (process.env.ELMO_ANTHROPIC_API_KEY) {
		env.ANTHROPIC_API_KEY = process.env.ELMO_ANTHROPIC_API_KEY;
	}
	if (process.env.ELMO_DATAFORSEO_LOGIN) {
		env.DATAFORSEO_LOGIN = process.env.ELMO_DATAFORSEO_LOGIN;
		env.DATAFORSEO_PASSWORD =
			process.env.ELMO_DATAFORSEO_PASSWORD ?? "";
	}
	if (process.env.ELMO_SCRAPE_TARGETS) {
		env.SCRAPE_TARGETS = process.env.ELMO_SCRAPE_TARGETS;
	} else {
		// Default: use the direct API providers matching the old hardcoded behavior
		env.SCRAPE_TARGETS = "chatgpt:openai-api:gpt-5-mini:online,claude:anthropic-api:claude-sonnet-4,google-ai-mode:dataforseo:online";
	}

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

	console.log(`Config written to ${configDir}`);

	await trackCliEvent("cli_init", {
		version,
		os: process.platform,
		arch: process.arch,
		node_version: process.version,
		postgres_mode: postgresMode,
		dev_mode: Boolean(options.dev),
	});
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

	if (!isCI()) {
		const s = p.spinner();
		s.start("Waiting for services to become healthy...");
		const ok = await waitForHealthy(configDir, 180_000);
		if (ok) {
			s.stop("All services healthy!");
		} else {
			s.stop("Health check timed out.");
			p.log.warn(
				"Some services did not report healthy status.",
			);
		}
	} else {
		console.log("Waiting for services to become healthy...");
		const ok = await waitForHealthy(configDir, 180_000);
		if (ok) {
			console.log("All services healthy.");
		} else {
			console.warn(
				"Some services did not report healthy status.",
			);
		}
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

async function runCompose(
	args: string[],
	options: DirOption,
): Promise<void> {
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

	log.step(
		`Building Docker images: ${targets.join(", ")}${noCache ? " (no cache)" : ""}...`,
	);

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
		? path.relative(
				options.repoRoot,
				path.join(options.dockerDir, "Dockerfile"),
			)
		: "docker/Dockerfile";

	if (options.postgresMode === "docker") {
		services.push(buildPostgresService());
		services.push(
			buildDbMigrateService({
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
	lines.push(
		...services.map((service) => indentBlock(service, 2)),
	);

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

function buildDbMigrateService(options: {
	dockerfilePath: string;
	repoRoot: string;
}): string {
	return [
		"db-migrate:",
		"  build:",
		`    context: ${options.repoRoot}`,
		`    dockerfile: ${options.dockerfilePath}`,
		"    target: migrate",
		"  environment:",
		"    - DATABASE_URL=postgres://postgres:postgres@postgres:5432/elmo",
		"  depends_on:",
		"    postgres:",
		"      condition: service_healthy",
	].join("\n");
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
		lines.push("  image: elmohq/web:latest");
	}

	lines.push(
		"  env_file:",
		"    - path: .env",
		"      required: true",
		"  ports:",
		'    - "1515:3000"',
	);

	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition =
				options.dependencyConditions[service] ??
				"service_started";
			lines.push(
				`    ${service}:`,
				`      condition: ${condition}`,
			);
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
		lines.push("  image: elmohq/worker:latest");
	}

	lines.push(
		"  env_file:",
		"    - path: .env",
		"      required: true",
	);

	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition =
				options.dependencyConditions[service] ??
				"service_started";
			lines.push(
				`    ${service}:`,
				`      condition: ${condition}`,
			);
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

async function getComposeServices(
	configDir: string,
): Promise<ComposeService[]> {
	const output = await runDockerComposeCapture(configDir, [
		"ps",
		"--format",
		"json",
	]);
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
				.map(
					(line) => JSON.parse(line) as ComposeService,
				);
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
	} else if (
		health === "starting" ||
		state.includes("starting")
	) {
		color = pc.yellow;
	}

	return color(
		`${label} ${state} ${service.Health ? `(${health})` : ""}`.trim(),
	);
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

async function waitForHealthy(
	configDir: string,
	timeoutMs: number,
): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const services = await getComposeServices(configDir);
		if (
			services.length > 0 &&
			services.every(isServiceReady)
		) {
			return true;
		}
		await sleep(3000);
	}
	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function runDockerCompose(
	configDir: string,
	args: string[],
): Promise<void> {
	return new Promise((resolve, reject) => {
		const composeFile = path.join(configDir, "elmo.yaml");
		const commandArgs = [
			"compose",
			"-f",
			composeFile,
			...args,
		];
		const child = spawn("docker", commandArgs, {
			stdio: "inherit",
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`docker compose exited with code ${code}`,
					),
				);
			}
		});
	});
}

function runDockerComposeCapture(
	configDir: string,
	args: string[],
): Promise<string> {
	return new Promise((resolve, reject) => {
		const composeFile = path.join(configDir, "elmo.yaml");
		const commandArgs = [
			"compose",
			"-f",
			composeFile,
			...args,
		];
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
				reject(
					new Error(
						stderr ||
							`docker compose exited with code ${code}`,
					),
				);
			}
		});
	});
}

function assertDockerRunning(): void {
	const result = spawnSync("docker", ["info"], {
		stdio: "ignore",
	});
	if (result.status !== 0) {
		throw new Error(
			"Docker does not appear to be running. Start Docker and try again.",
		);
	}
}

// ── Docker Dir Resolution ────────────────────────────────────────────────────

async function resolveDockerDirInteractive(
	cwd: string,
): Promise<string> {
	const inCwd = await fileExists(
		path.join(cwd, "Dockerfile"),
	);
	const inDockerDir = await fileExists(
		path.join(cwd, "docker", "Dockerfile"),
	);
	const defaultDir = inCwd
		? "."
		: inDockerDir
			? "docker"
			: ".";

	const dir = await p.text({
		message:
			"Path to docker directory (contains Dockerfile)",
		defaultValue: defaultDir,
	});
	assertNotCancelled(dir);

	const resolved = path.resolve(cwd, dir);
	if (
		!(await fileExists(path.join(resolved, "Dockerfile")))
	) {
		p.log.error(
			`Dockerfile not found in ${resolved}. Provide the directory that contains Dockerfile.`,
		);
		process.exit(1);
	}

	return resolved;
}

async function resolveDockerDirAuto(
	cwd: string,
	explicitDir?: string,
): Promise<string> {
	if (explicitDir) {
		const resolved = path.resolve(cwd, explicitDir);
		if (
			!(await fileExists(
				path.join(resolved, "Dockerfile"),
			))
		) {
			throw new Error(
				`Dockerfile not found in ${resolved}`,
			);
		}
		return resolved;
	}

	// Auto-detect
	if (
		await fileExists(
			path.join(cwd, "docker", "Dockerfile"),
		)
	) {
		return path.resolve(cwd, "docker");
	}
	if (await fileExists(path.join(cwd, "Dockerfile"))) {
		return cwd;
	}

	throw new Error(
		"Could not find Dockerfile. Specify --docker-dir or set ELMO_DOCKER_DIR.",
	);
}

// ── Config Dir Resolution ────────────────────────────────────────────────────

async function resolveConfigDir(
	explicitDir?: string,
): Promise<string> {
	if (explicitDir) {
		const resolved = path.resolve(
			process.cwd(),
			explicitDir,
		);
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
		throw new Error(
			"No config found. Run `elmo init` or specify --dir.",
		);
	}

	const resolved = path.resolve(config.configDir);
	const composePath = path.join(resolved, "elmo.yaml");
	if (!(await fileExists(composePath))) {
		throw new Error(
			`Config directory does not contain elmo.yaml: ${resolved}\nRun \`elmo init\` to regenerate.`,
		);
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
	await fs.writeFile(
		CONFIG_FILE,
		JSON.stringify(globalConfig, null, 2),
		"utf8",
	);
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
	await fs.writeFile(
		envPath,
		buildEnvFile(initConfig.env),
		"utf8",
	);
	await fs.writeFile(composePath, initConfig.composeYaml, "utf8");
}

function buildEnvFile(env: EnvMap): string {
	const lines = [
		"# Generated by elmo init",
		"# WARNING: contains secrets. Do not commit.",
		"",
	];

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
		const escaped = value
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
}

async function detectSettingsFromConfig(
	configDir: string,
): Promise<{
	dev: boolean;
	postgresMode: PostgresMode;
	repoRoot: string;
	dockerDir?: string;
}> {
	const envPath = path.join(configDir, ".env");
	const env = await readEnvFile(envPath);

	const postgresMode: PostgresMode =
		env.DATABASE_URL?.includes("postgres:5432")
			? "docker"
			: "external";

	const yamlPath = path.join(configDir, "elmo.yaml");
	let dev = false;
	let repoRoot = process.cwd();

	try {
		const yamlContent = await fs.readFile(yamlPath, "utf8");
		dev = yamlContent.includes("build:");
		const contextMatch = yamlContent.match(
			/context:\s+(.+)/,
		);
		if (contextMatch) {
			repoRoot = contextMatch[1].trim();
		}
	} catch {
		// Use defaults
	}

	return { dev, postgresMode, repoRoot };
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
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
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
	const selfDir = path.dirname(
		fileURLToPath(import.meta.url),
	);
	const packagePath = path.resolve(
		selfDir,
		"..",
		"package.json",
	);
	const contents = await fs.readFile(packagePath, "utf8");
	const json = JSON.parse(contents) as { version?: string };
	return json.version!;
}

async function maybeNotifyNewVersion(
	currentVersion: string,
): Promise<void> {
	try {
		const response = await fetch(
			"https://registry.npmjs.org/@elmohq/cli/latest",
		);
		if (!response.ok) {
			return;
		}
		const data = (await response.json()) as {
			version?: string;
		};
		if (!data.version) {
			return;
		}
		if (
			semver.valid(currentVersion) &&
			semver.lt(currentVersion, data.version)
		) {
			log.warn(
				`New CLI version available (${data.version}). Run: npm install -g @elmohq/cli@latest`,
			);
		}
	} catch {
		// Ignore update errors
	}
}

// ── Entry Point ──────────────────────────────────────────────────────────────

main().catch((error) => {
	const msg =
		error instanceof Error ? error.message : String(error);
	console.error(`\n${pc.red("Error:")} ${msg}`);
	process.exit(1);
});
