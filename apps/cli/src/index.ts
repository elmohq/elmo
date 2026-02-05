#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { createInterface } from "readline/promises";
import { spawn, spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import semver from "semver";

type GlobalConfig = {
	configDir: string;
	dockerDir?: string;
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
};

type PostgresMode = "docker" | "external";
type TinybirdMode = "docker" | "external";

type EnvMap = Record<string, string>;

const CONFIG_HOME = path.join(os.homedir(), ".config", "elmo");
const CONFIG_FILE = path.join(CONFIG_HOME, "config.json");
const DEFAULT_ORG_ID = "default";
const DEFAULT_ORG_NAME = "Default Organization";
const DEFAULT_APP_NAME = "Elmo";
const DEFAULT_APP_ICON = "/brands/elmo/icon.png";
const DEFAULT_APP_URL = "http://localhost:1515";
const LOCAL_DATABASE_URL = "postgres://postgres:postgres@postgres:5432/elmo";
const LOCAL_TINYBIRD_URL = "http://tinybird:7181";

const log = {
	info: (message: string) => console.log(pc.cyan(message)),
	success: (message: string) => console.log(pc.green(message)),
	warn: (message: string) => console.warn(pc.yellow(message)),
	error: (message: string) => console.error(pc.red(message)),
};

async function main() {
	const version = await getPackageVersion();
	const program = new Command();

	program
		.name("elmo")
		.description("Elmo local docker CLI")
		.version(version);

	program
		.command("init")
		.description("Configure Elmo on Docker Compose")
		.option("--dev", "Use local build context (repo only)")
		.action(async (options: InitOptions) => {
			await withVersionCheck(version, async () => {
				await runInit(options);
			});
		});

	program
		.command("start")
		.description("Start Elmo on Docker Compose")
		.action(async () => {
			await withVersionCheck(version, async () => {
				await runStart();
			});
		});

	program
		.command("status")
		.description("Check service health status")
		.action(async () => {
			await withVersionCheck(version, async () => {
				await runStatus();
			});
		});

	program
		.command("compose")
		.description("Run Docker Compose commands using your Elmo config")
		.allowUnknownOption(true)
		.argument("[args...]", "Arguments passed to Docker Compose")
		.action(async (args: string[]) => {
			await withVersionCheck(version, async () => {
				await runCompose(args);
			});
		});

	program
		.command("logs")
		.description("Shortcut for Docker Compose logs")
		.allowUnknownOption(true)
		.argument("[args...]", "Arguments passed to Docker Compose logs")
		.action(async (args: string[]) => {
			await withVersionCheck(version, async () => {
				await runCompose(["logs", ...args]);
			});
		});

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

async function runInit(options: InitOptions): Promise<void> {
	assertInteractive();
	await ensureDir(CONFIG_HOME);

	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const cwd = process.cwd();
	const dockerDir = options.dev ? await promptDockerDir(rl, cwd) : undefined;
	const repoRoot = options.dev ? path.resolve(dockerDir!, "..") : cwd;
	const hasLocalCompose = await fileExists(path.join(cwd, "elmo.yaml"));
	let configDir: string | null = null;

	try {
		if (hasLocalCompose) {
			const useLocal = await promptYesNo(
				rl,
				"Found elmo.yaml in this directory. Use it as your global config location?",
				true,
			);
			if (useLocal) {
				configDir = cwd;
				const keepExisting = await promptYesNo(
					rl,
					"Keep the existing config files without changes?",
					true,
				);
				if (keepExisting) {
					await writeGlobalConfig(configDir, dockerDir);
					log.success(`Global config updated to ${configDir}.`);
					const hasEnv = await fileExists(path.join(configDir, ".env"));
					if (!hasEnv) {
						log.warn("No .env file found alongside elmo.yaml.");
					}
					return;
				}
			}
		}

		if (!configDir) {
			const location = await promptSelect(
				rl,
				"Where should the Elmo config be created?",
				[
					{ label: "Current directory", value: "cwd" },
					{ label: "Create a subdirectory", value: "subdir" },
				],
				"cwd",
			);

			if (location === "cwd") {
				configDir = cwd;
			} else {
				const subdir = await promptText(rl, "Subdirectory name", {
					defaultValue: "elmo",
					required: true,
				});
				configDir = path.resolve(cwd, subdir);
			}
		}

		if (!configDir) {
			throw new Error("Unable to resolve configuration directory.");
		}

		const existingConfig = await readGlobalConfig();
		if (
			existingConfig?.configDir &&
			path.resolve(existingConfig.configDir) !== configDir
		) {
			const replacePointer = await promptYesNo(
				rl,
				`Global config currently points to ${existingConfig.configDir}. Update it to ${configDir}?`,
				true,
			);
			if (!replacePointer) {
				log.warn("Init cancelled.");
				return;
			}
		}

		const existingFiles = await detectExistingConfigFiles(configDir);
		if (existingFiles.length > 0) {
			log.warn(
				`Existing config files found in ${configDir}: ${existingFiles.join(", ")}`,
			);
			const strategy = await promptSelect(
				rl,
				"How would you like to proceed?",
				[
					{ label: "Update (overwrite elmo.yaml and .env)", value: "update" },
					{
						label: "Replace (remove elmo.yaml/.env and regenerate)",
						value: "replace",
					},
					{ label: "Cancel", value: "cancel" },
				],
				"update",
			);

			if (strategy === "cancel") {
				log.warn("Init cancelled.");
				return;
			}

			if (strategy === "replace") {
				await removeKnownConfigFiles(configDir);
			}
		}

		const initConfig = await gatherInitConfig(rl, options, {
			repoRoot,
			dockerDir,
		});
		await ensureDir(configDir);
		await writeGlobalConfig(configDir, dockerDir);
		await writeConfigFiles(configDir, initConfig);

		log.success(`Config written to ${configDir}`);
		log.warn(
			"Your .env contains secrets. Do not commit it to version control.",
		);

		if (options.dev) {
			log.info(
				"Dev mode enabled. Run `elmo compose build` before starting.",
			);
		}

		const shouldStart = await promptYesNo(
			rl,
			"Start the stack now?",
			true,
		);
		if (shouldStart) {
			await runStart();
		} else {
			log.info("You can start later with `elmo start`.");
		}
	} finally {
		rl.close();
	}
}

async function runStart(): Promise<void> {
	const configDir = await getConfigDirOrThrow();
	assertDockerRunning();

	log.info("Starting Docker Compose stack...");
	await runDockerCompose(configDir, ["up", "-d"]);

	log.info("Waiting for services to become healthy...");
	const ok = await waitForHealthy(configDir, 180_000);
	if (!ok) {
		log.warn("Some services did not report healthy status.");
	} else {
		log.success("Elmo stack is healthy.");
	}

	log.info("Examples:");
	console.log(`  ${pc.bold("elmo logs -f")}`);
	console.log(`  ${pc.bold("elmo compose logs -f web")}`);
	console.log(`  ${pc.bold("elmo compose ps")}`);
}

async function runStatus(): Promise<void> {
	const configDir = await getConfigDirOrThrow();
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

async function runCompose(args: string[]): Promise<void> {
	const configDir = await getConfigDirOrThrow();
	assertDockerRunning();
	await runDockerCompose(configDir, args);
}

async function gatherInitConfig(
	rl: ReturnType<typeof createInterface>,
	options: InitOptions,
	paths: { repoRoot: string; dockerDir?: string },
) {
	const env: EnvMap = {};

	log.info("Core configuration (these will be written to .env)");
	env.DEPLOYMENT_MODE = "local";
	env.NEXT_PUBLIC_DEPLOYMENT_MODE = "local";

	env.DEFAULT_ORG_ID = await promptText(rl, "Default org ID", {
		defaultValue: DEFAULT_ORG_ID,
		required: true,
	});
	env.DEFAULT_ORG_NAME = await promptText(rl, "Default org name", {
		defaultValue: DEFAULT_ORG_NAME,
		required: true,
	});
	env.APP_NAME = await promptText(rl, "App name", {
		defaultValue: DEFAULT_APP_NAME,
	});
	env.APP_ICON = await promptText(rl, "App icon path or URL", {
		defaultValue: DEFAULT_APP_ICON,
	});
	env.APP_URL = await promptText(rl, "App URL", {
		defaultValue: DEFAULT_APP_URL,
	});

	env.NEXT_PUBLIC_APP_NAME = env.APP_NAME;
	env.NEXT_PUBLIC_APP_ICON = env.APP_ICON;
	env.NEXT_PUBLIC_APP_URL = env.APP_URL;

	log.info("Data stores");
	const postgresMode = await promptSelect<PostgresMode>(
		rl,
		"PostgreSQL connection",
		[
			{ label: "Run Postgres in Docker", value: "docker" },
			{ label: "Use existing Postgres (DATABASE_URL)", value: "external" },
		],
		"docker",
	);

	if (postgresMode === "external") {
		env.DATABASE_URL = await promptText(rl, "DATABASE_URL", {
			required: true,
		});
	} else {
		env.DATABASE_URL = LOCAL_DATABASE_URL;
	}

	const tinybirdMode = await promptSelect<TinybirdMode>(
		rl,
		"Tinybird analytics",
		[
			{ label: "Run Tinybird Local in Docker", value: "docker" },
			{ label: "Use Tinybird Cloud", value: "external" },
		],
		"docker",
	);

	if (tinybirdMode === "docker") {
		env.TINYBIRD_BASE_URL = LOCAL_TINYBIRD_URL;
		env.CLICKHOUSE_HOST = LOCAL_TINYBIRD_URL;
		env.TINYBIRD_WORKSPACE = "default";
	} else {
		env.TINYBIRD_BASE_URL = await promptText(rl, "Tinybird base URL", {
			required: true,
		});
		env.TINYBIRD_TOKEN = await promptText(rl, "Tinybird token", {
			required: true,
		});
		env.TINYBIRD_WORKSPACE = await promptText(rl, "Tinybird workspace", {
			defaultValue: "default",
			required: true,
		});
		env.CLICKHOUSE_HOST = await promptText(rl, "ClickHouse host", {
			defaultValue: env.TINYBIRD_BASE_URL,
			required: true,
		});
	}

	log.info("AI + data providers");
	if (await promptYesNo(rl, "Set OpenAI credentials now?", true)) {
		env.OPENAI_API_KEY = await promptText(rl, "OPENAI_API_KEY", {
			required: true,
		});
	}

	if (await promptYesNo(rl, "Set Anthropic credentials now?", true)) {
		env.ANTHROPIC_API_KEY = await promptText(rl, "ANTHROPIC_API_KEY", {
			required: true,
		});
	}

	if (await promptYesNo(rl, "Set DataForSEO credentials now?", false)) {
		env.DATAFORSEO_LOGIN = await promptText(rl, "DATAFORSEO_LOGIN", {
			required: true,
		});
		env.DATAFORSEO_PASSWORD = await promptText(rl, "DATAFORSEO_PASSWORD", {
			required: true,
		});
	}

	const composeYaml = buildComposeYaml({
		dev: Boolean(options.dev),
		postgresMode,
		tinybirdMode,
		repoRoot: paths.repoRoot,
		dockerDir: paths.dockerDir,
	});

	return {
		env,
		composeYaml,
		postgresMode,
		tinybirdMode,
		dev: Boolean(options.dev),
	};
}

async function writeConfigFiles(
	configDir: string,
	initConfig: {
		env: EnvMap;
		composeYaml: string;
		postgresMode: PostgresMode;
		tinybirdMode: TinybirdMode;
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
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
}

function buildComposeYaml(options: {
	dev: boolean;
	postgresMode: PostgresMode;
	tinybirdMode: TinybirdMode;
	repoRoot: string;
	dockerDir?: string;
}): string {
	const services: string[] = [];
	const volumes = new Set<string>();

	const dependsOnWeb: string[] = [];
	const dependsOnWorker: string[] = [];

	const dependencyConditions: Record<string, string> = {
		postgres: "service_healthy",
		tinybird: "service_healthy",
		"tinybird-init": "service_completed_successfully",
	};

	if (options.postgresMode === "docker") {
		services.push(buildPostgresService());
		dependsOnWeb.push("postgres");
		dependsOnWorker.push("postgres");
		volumes.add("postgres_data");
	}

	if (options.tinybirdMode === "docker") {
		services.push(buildTinybirdService());
		services.push(buildTinybirdInitService());
		dependsOnWeb.push("tinybird", "tinybird-init");
		dependsOnWorker.push("tinybird", "tinybird-init");
		volumes.add("tinybird_config");
	}

	services.push(
		buildWebService({
			dev: options.dev,
			dependsOn: dependsOnWeb,
			dependencyConditions,
			repoRoot: options.repoRoot,
			dockerfilePath: options.dockerDir
				? path.relative(
						options.repoRoot,
						path.join(options.dockerDir, "Dockerfile"),
					)
				: "docker/Dockerfile",
			includeTinybirdVolume: options.tinybirdMode === "docker",
		}),
	);
	services.push(
		buildWorkerService({
			dev: options.dev,
			dependsOn: dependsOnWorker,
			dependencyConditions,
			repoRoot: options.repoRoot,
			dockerfilePath: options.dockerDir
				? path.relative(
						options.repoRoot,
						path.join(options.dockerDir, "Dockerfile"),
					)
				: "docker/Dockerfile",
			includeTinybirdVolume: options.tinybirdMode === "docker",
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
	].join("\n");
}

function buildTinybirdService(): string {
	return [
		"tinybird:",
		"  image: tinybirdco/tinybird-local:latest",
		"  platform: linux/amd64",
		"  environment:",
		'    COMPATIBILITY_MODE: "1"',
		"  ports:",
		'    - "7181:7181"',
		"  stop_grace_period: 2s",
		"  healthcheck:",
		'    test: ["CMD", "curl", "-f", "http://localhost:7181/v0/health"]',
		"    interval: 5s",
		"    timeout: 5s",
		"    retries: 30",
	].join("\n");
}

function buildTinybirdInitService(): string {
	return [
		"tinybird-init:",
		"  image: alpine:latest",
		"  volumes:",
		"    - tinybird_config:/config",
		"  depends_on:",
		"    tinybird:",
		"      condition: service_healthy",
		"  entrypoint: [\"/bin/sh\", \"-c\"]",
		"  command:",
		"    - |",
		"      apk add --no-cache curl jq > /dev/null 2>&1",
		"      echo \"Fetching Tinybird token...\"",
		"      TOKEN=$$(curl -s http://tinybird:7181/tokens | jq -r '.workspace_admin_token')",
		"      echo \"TINYBIRD_TOKEN=$$TOKEN\" > /config/tinybird.env",
		"      echo \"Token saved to /config/tinybird.env\"",
	].join("\n");
}

function buildWebService(options: {
	dev: boolean;
	dependsOn: string[];
	dependencyConditions: Record<string, string>;
	repoRoot: string;
	dockerfilePath: string;
	includeTinybirdVolume: boolean;
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

	if (options.includeTinybirdVolume) {
		lines.push("  volumes:", "    - tinybird_config:/app/tinybird-config:ro");
	}

	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition =
				options.dependencyConditions[service] ?? "service_started";
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
	includeTinybirdVolume: boolean;
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

	if (options.includeTinybirdVolume) {
		lines.push("  volumes:", "    - tinybird_config:/app/tinybird-config:ro");
	}

	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition =
				options.dependencyConditions[service] ?? "service_started";
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

async function getComposeServices(configDir: string): Promise<ComposeService[]> {
	const output = await runDockerComposeCapture(configDir, ["ps", "--format", "json"]);
	if (!output.trim()) {
		return [];
	}
	try {
		return JSON.parse(output) as ComposeService[];
	} catch (error) {
		log.warn("Unable to parse docker compose status.");
		return [];
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
	if (service.Service === "tinybird-init") {
		return service.ExitCode === 0;
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
		const child = spawn("docker", commandArgs, { stdio: "inherit" });
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`docker compose exited with code ${code}`));
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
		const commandArgs = ["compose", "-f", composeFile, ...args];
		const child = spawn("docker", commandArgs);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data) => {
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
	const result = spawnSync("docker", ["info"], { stdio: "ignore" });
	if (result.status !== 0) {
		throw new Error(
			"Docker does not appear to be running. Start Docker and try again.",
		);
	}
}

async function getConfigDirOrThrow(): Promise<string> {
	const config = await readGlobalConfig();
	if (!config?.configDir) {
		throw new Error(
			"No config found. Run `elmo init` to create your local setup.",
		);
	}
	const resolved = path.resolve(config.configDir);
	const composePath = path.join(resolved, "elmo.yaml");
	if (!(await fileExists(composePath))) {
		throw new Error(
			`Config directory does not contain elmo.yaml: ${resolved}. Run \`elmo init\` to regenerate.`,
		);
	}
	return resolved;
}

async function readGlobalConfig(): Promise<GlobalConfig | null> {
	try {
		const contents = await fs.readFile(CONFIG_FILE, "utf8");
		return JSON.parse(contents) as GlobalConfig;
	} catch {
		return null;
	}
}

async function writeGlobalConfig(
	configDir: string,
	dockerDir?: string,
): Promise<void> {
	const config: GlobalConfig = {
		configDir,
		updatedAt: new Date().toISOString(),
		...(dockerDir ? { dockerDir } : {}),
	};
	await ensureDir(CONFIG_HOME);
	await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

async function detectExistingConfigFiles(configDir: string): Promise<string[]> {
	const candidates = ["elmo.yaml", ".env"];
	const existing: string[] = [];
	for (const file of candidates) {
		if (await fileExists(path.join(configDir, file))) {
			existing.push(file);
		}
	}
	return existing;
}

async function removeKnownConfigFiles(configDir: string): Promise<void> {
	const targets = [
		path.join(configDir, "elmo.yaml"),
		path.join(configDir, ".env"),
		path.join(configDir, "init-scripts"),
	];
	for (const target of targets) {
		if (await fileExists(target)) {
			await fs.rm(target, { recursive: true, force: true });
		}
	}
}

async function promptText(
	rl: ReturnType<typeof createInterface>,
	label: string,
	options: { defaultValue?: string; required?: boolean } = {},
): Promise<string> {
	while (true) {
		const suffix = options.defaultValue ? ` (${options.defaultValue})` : "";
		const value = (await rl.question(`${label}${suffix}: `)).trim();
		if (value) {
			return value;
		}
		if (options.defaultValue) {
			return options.defaultValue;
		}
		if (!options.required) {
			return "";
		}
		log.warn("This value is required.");
	}
}

async function promptYesNo(
	rl: ReturnType<typeof createInterface>,
	label: string,
	defaultValue: boolean,
): Promise<boolean> {
	const hint = defaultValue ? "[Y/n]" : "[y/N]";
	while (true) {
		const value = (await rl.question(`${label} ${hint}: `)).trim().toLowerCase();
		if (!value) {
			return defaultValue;
		}
		if (["y", "yes"].includes(value)) {
			return true;
		}
		if (["n", "no"].includes(value)) {
			return false;
		}
		log.warn("Please enter yes or no.");
	}
}

async function promptSelect<T extends string>(
	rl: ReturnType<typeof createInterface>,
	label: string,
	options: { label: string; value: T }[],
	defaultValue: T,
): Promise<T> {
	while (true) {
		console.log(`\n${label}:`);
		options.forEach((option, index) => {
			const isDefault = option.value === defaultValue;
			const marker = isDefault ? "*" : " ";
			console.log(`  ${marker} ${index + 1}) ${option.label}`);
		});

		const response = (await rl.question("Select an option: ")).trim();
		if (!response) {
			return defaultValue;
		}
		const index = Number(response);
		if (!Number.isNaN(index) && options[index - 1]) {
			return options[index - 1].value;
		}
		const match = options.find(
			(option) => option.value === response || option.label === response,
		);
		if (match) {
			return match.value;
		}
		log.warn("Please enter a valid option.");
	}
}

async function promptDockerDir(
	rl: ReturnType<typeof createInterface>,
	cwd: string,
): Promise<string> {
	const dockerfileHere = await fileExists(path.join(cwd, "Dockerfile"));
	const dockerfileInDockerDir = await fileExists(
		path.join(cwd, "docker", "Dockerfile"),
	);
	const defaultValue = dockerfileHere
		? "."
		: dockerfileInDockerDir
			? "docker"
			: ".";

	const input = await promptText(
		rl,
		"Path to docker directory (use . for current dir)",
		{ defaultValue, required: true },
	);

	const resolved = path.resolve(cwd, input);
	const dockerfilePath = path.join(resolved, "Dockerfile");
	if (!(await fileExists(dockerfilePath))) {
		throw new Error(
			`Dockerfile not found in ${resolved}. Provide the directory that contains Dockerfile.`,
		);
	}
	return resolved;
}

function assertInteractive(): void {
	if (!process.stdin.isTTY) {
		throw new Error("Interactive mode required. Run this command in a TTY.");
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

async function getPackageVersion(): Promise<string> {
	const packagePath = path.resolve(__dirname, "..", "package.json");
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
		const data = (await response.json()) as { version?: string };
		if (!data.version) {
			return;
		}
		if (semver.valid(currentVersion) && semver.lt(currentVersion, data.version)) {
			log.warn(
				`New CLI version available (${data.version}). Run: npm install -g @elmohq/cli@latest`,
			);
		}
	} catch {
		// Ignore update errors
	}
}

main().catch((error) => {
	log.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
