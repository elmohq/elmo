#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { Command } from "commander";
import { parse } from "dotenv";
import pc from "picocolors";
import semver from "semver";
import { PostHog } from "posthog-node";
//#region ../../packages/config/src/scrape-targets.ts
/**
* Parse the SCRAPE_TARGETS env var into structured ModelConfig objects.
*
* Parsing: split on ":". First = model, second = provider. If last segment is "online",
* pop it (websearch = true). Remaining middle segments rejoined with ":" = version slug.
* This naturally handles OpenRouter variant suffixes like ":free".
*/
function parseScrapeTargets(envValue) {
	if (!envValue || !envValue.trim()) throw new Error("SCRAPE_TARGETS environment variable is required. Set it to configure which AI models to track. Example:\n  SCRAPE_TARGETS=chatgpt:olostep:online,google-ai-mode:olostep:online,copilot:olostep:online\nSee https://docs.elmohq.com/docs/user-guide/providers for details.");
	return envValue.split(",").map((raw) => {
		const trimmed = raw.trim();
		if (!trimmed) throw new Error("Invalid SCRAPE_TARGETS: empty entry (check for trailing commas)");
		const parts = trimmed.split(":");
		if (parts.length < 2) throw new Error(`Invalid SCRAPE_TARGETS entry: "${trimmed}" (need at least model:provider)`);
		const model = parts[0];
		const provider = parts[1];
		const webSearch = parts[parts.length - 1] === "online";
		const versionParts = parts.slice(2, webSearch ? -1 : void 0);
		return {
			model,
			provider,
			version: versionParts.length > 0 ? versionParts.join(":") : void 0,
			webSearch
		};
	});
}
/**
* Inverse of parseScrapeTargets for a single entry: build the
* model:provider[:version][:online] string from a ModelConfig.
*/
function formatScrapeTarget(config) {
	const parts = [config.model, config.provider];
	if (config.version) parts.push(config.version);
	if (config.webSearch) parts.push("online");
	return parts.join(":");
}
//#endregion
//#region src/telemetry.ts
const POSTHOG_PUBLIC_KEY = "phc_Jhx9LnI9cTDFHpQmpOzJSDTW127qD9pFU65KRnYym6z";
const POSTHOG_HOST = "https://us.i.posthog.com";
function envDisabled() {
	return Boolean(process.env.DISABLE_TELEMETRY);
}
async function readEnvKey(configDir, key) {
	try {
		return parse(await fs.readFile(path.join(configDir, ".env"), "utf8"))[key];
	} catch {
		return;
	}
}
async function isTelemetryDisabled(configDir) {
	if (envDisabled()) return true;
	return Boolean(await readEnvKey(configDir, "DISABLE_TELEMETRY"));
}
async function trackCliEvent(configDir, eventName, properties, personProperties) {
	if (await isTelemetryDisabled(configDir)) return;
	const distinctId = await readEnvKey(configDir, "DEPLOYMENT_ID");
	if (!distinctId) return;
	try {
		const client = new PostHog(POSTHOG_PUBLIC_KEY, { host: POSTHOG_HOST });
		client.capture({
			distinctId,
			event: eventName,
			properties: {
				...properties,
				...personProperties ? { $set: personProperties } : {}
			}
		});
		await client.shutdown();
	} catch {}
}
async function submitNewsletterSignup(configDir, email) {
	try {
		const distinctId = (await isTelemetryDisabled(configDir) ? null : await readEnvKey(configDir, "DEPLOYMENT_ID")) ?? email;
		const client = new PostHog(POSTHOG_PUBLIC_KEY, { host: POSTHOG_HOST });
		client.capture({
			distinctId,
			event: "newsletter_signup",
			properties: {
				source: "cli_init",
				$set: {
					email,
					wants_updates: true
				}
			}
		});
		await client.shutdown();
	} catch {}
}
//#endregion
//#region src/index.ts
const CONFIG_HOME = path.join(os.homedir(), ".elmo");
const DEFAULT_APP_NAME = "Elmo";
const DEFAULT_APP_ICON = "/icons/elmo-icon.svg";
const DEFAULT_APP_PORT = 1515;
const LOCAL_DATABASE_URL = "postgres://postgres:postgres@postgres:5432/elmo";
const TELEMETRY_DOC_URL = "https://elmohq.com/docs/developer-guide/telemetry";
const ELMO_ASCII = [
	"",
	"      ▄▄                ",
	"      ██                ",
	"▄█▀█▄ ██ ███▄███▄ ▄███▄ ",
	"██▄█▀ ██ ██ ██ ██ ██ ██ ",
	"▀█▄▄▄ ██ ██ ██ ██ ▀███▀ ",
	""
].join("\n");
function printBanner() {
	console.log(`[38;2;37;99;235m${ELMO_ASCII}[0m`);
}
const log = {
	info: (msg) => p.log.info(msg),
	warn: (msg) => p.log.warn(msg),
	error: (msg) => p.log.error(msg),
	success: (msg) => p.log.success(msg),
	step: (msg) => p.log.step(msg)
};
function assertNotCancelled(value) {
	if (p.isCancel(value)) {
		p.cancel("Setup cancelled.");
		process.exit(0);
	}
}
function generateSecret(bytes = 32) {
	return crypto.randomBytes(bytes).toString("base64url");
}
function link(text, url) {
	return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}
async function main() {
	const version = await getPackageVersion();
	const program = new Command();
	program.name("elmo").version(version).option("--dir <path>", "Config directory").configureHelp({ showGlobalOptions: true }).action(() => {
		printBanner();
		program.outputHelp();
	});
	program.command("init").description("set up local Elmo instance").option("--dev", "Use local build context (repo only)").option("--docker-dir <path>", "Path to Docker build context (dev mode)").action(async (_opts, cmd) => {
		await withVersionCheck(version, () => runInit(cmd.optsWithGlobals(), version));
	});
	program.command("compose").description("run Docker Compose commands using your Elmo config").allowUnknownOption(true).argument("[args...]", "Arguments passed to Docker Compose").action(async (args, _opts, cmd) => {
		await withVersionCheck(version, () => runCompose(args, cmd.optsWithGlobals()));
	});
	program.command("edit").description("change API keys, scrape targets, or the Docker Compose YAML").argument("<env|compose>", "which config file to edit").action(async (target, _opts, cmd) => {
		await runEdit(target, cmd.optsWithGlobals());
	});
	await program.parseAsync(process.argv);
}
async function withVersionCheck(version, fn) {
	const notifyPromise = maybeNotifyNewVersion(version);
	await fn();
	await notifyPromise.catch(() => void 0);
}
async function runInit(options, version) {
	printBanner();
	p.intro(pc.bold("Setting up Elmo"));
	const cwd = process.cwd();
	const configDir = options.dir ? path.resolve(cwd, options.dir) : CONFIG_HOME;
	const existingEnvPath = path.join(configDir, ".env");
	let preservedDeploymentId;
	if (await fileExists(existingEnvPath)) {
		const contents = await fs.readFile(existingEnvPath, "utf8");
		if (!(contents.startsWith("# Rendered by elmo") || contents.startsWith("# Generated by elmo"))) {
			p.log.warn(`A .env file already exists in ${configDir} and was NOT created by Elmo.`);
			const overwrite = await p.confirm({
				message: "Overwrite the existing .env file? This cannot be undone.",
				initialValue: false
			});
			assertNotCancelled(overwrite);
			if (!overwrite) {
				p.cancel("Setup cancelled. Choose a different directory with --dir.");
				process.exit(0);
			}
		} else {
			p.log.warn(`An existing Elmo config was found at ${configDir}.`);
			const overwrite = await p.confirm({
				message: "Overwrite it with new values? Existing secrets (DATABASE_URL, API keys, etc.) will be replaced.",
				initialValue: false
			});
			assertNotCancelled(overwrite);
			if (!overwrite) {
				p.cancel("Setup cancelled. Use `elmo edit env` to change individual values.");
				process.exit(0);
			}
			preservedDeploymentId = parse(contents).DEPLOYMENT_ID;
		}
	}
	let dockerDir;
	let repoRoot;
	if (options.dev) {
		if (options.dockerDir) {
			dockerDir = path.resolve(cwd, options.dockerDir);
			if (!await fileExists(path.join(dockerDir, "Dockerfile"))) {
				p.log.error(`Dockerfile not found in ${dockerDir}`);
				process.exit(1);
			}
		} else dockerDir = await resolveDockerDirInteractive(cwd);
		repoRoot = path.resolve(dockerDir, "..");
	} else repoRoot = cwd;
	const postgresMode = await p.select({
		message: "PostgreSQL connection",
		options: [{
			value: "docker",
			label: "Run Postgres in Docker"
		}, {
			value: "external",
			label: "Use existing Postgres (provide DATABASE_URL)"
		}],
		initialValue: "docker"
	});
	assertNotCancelled(postgresMode);
	const env = {};
	env.DEPLOYMENT_MODE = "local";
	env.VITE_DEPLOYMENT_MODE = "local";
	env.DEPLOYMENT_ID = preservedDeploymentId ?? crypto.randomUUID();
	env.BETTER_AUTH_SECRET = generateSecret();
	env.APP_NAME = DEFAULT_APP_NAME;
	env.APP_ICON = DEFAULT_APP_ICON;
	env.VITE_APP_NAME = DEFAULT_APP_NAME;
	env.VITE_APP_ICON = DEFAULT_APP_ICON;
	if (postgresMode === "external") {
		p.note("Must be an IPv4-compatible direct connection or database pooler.", "DATABASE_URL");
		const url = await p.password({
			message: "DATABASE_URL",
			validate: (v) => !v ? "Required" : void 0
		});
		assertNotCancelled(url);
		env.DATABASE_URL = url;
	} else env.DATABASE_URL = LOCAL_DATABASE_URL;
	const setupMode = await configureProvidersInteractive(env);
	p.note([
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
		"Toggle later by editing DISABLE_TELEMETRY in .env (`elmo edit env`)."
	].join("\n"), "Telemetry");
	const telemetryEnabled = await p.confirm({
		message: "Share telemetry?",
		initialValue: true
	});
	assertNotCancelled(telemetryEnabled);
	if (!telemetryEnabled) env.DISABLE_TELEMETRY = "1";
	const updatesEmail = await p.text({
		message: "Enter your work email to receive product updates (optional)",
		placeholder: "you@example.com"
	});
	const email = p.isCancel(updatesEmail) ? void 0 : updatesEmail || void 0;
	const portInput = await p.text({
		message: "Web app port",
		placeholder: String(DEFAULT_APP_PORT),
		defaultValue: String(DEFAULT_APP_PORT),
		validate: (v) => {
			if (!v) return void 0;
			const n = Number(v);
			if (!Number.isInteger(n) || n < 1 || n > 65535) return "Must be an integer between 1 and 65535";
		}
	});
	assertNotCancelled(portInput);
	const port = Number(portInput);
	env.APP_URL = `http://localhost:${port}`;
	env.VITE_APP_URL = env.APP_URL;
	const composeYaml = buildComposeYaml({
		dev: Boolean(options.dev),
		postgresMode,
		repoRoot,
		dockerDir,
		port,
		version
	});
	await ensureDir(configDir);
	await writeConfigFiles(configDir, {
		env,
		composeYaml,
		postgresMode,
		dev: Boolean(options.dev),
		version
	});
	p.log.success(`Config written to ${configDir}`);
	p.log.warn("Your generated .env file contains secrets — do not commit it to version control.");
	if (options.dev) p.log.info("Dev mode enabled. Run `elmo compose build` before starting.");
	const shouldStart = await p.confirm({
		message: "Start the stack now?",
		initialValue: true
	});
	assertNotCancelled(shouldStart);
	if (shouldStart) await doStart(configDir);
	else p.log.info("You can start later with `elmo compose up -d`.");
	await trackCliEvent(configDir, "cli_init", {
		version,
		os: process.platform,
		arch: process.arch,
		node_version: process.version,
		postgres_mode: postgresMode,
		dev_mode: Boolean(options.dev),
		setup_mode: setupMode,
		has_scraper: Boolean(env.BRIGHTDATA_API_TOKEN || env.OLOSTEP_API_KEY),
		has_direct_api: hasDirectApiConfigured(env)
	});
	if (email) await submitNewsletterSignup(configDir, email);
	p.log.message(`If you find Elmo useful, star us on GitHub!\n  ${link(pc.cyan("https://github.com/elmohq/elmo"), "https://github.com/elmohq/elmo")}`);
	p.outro(pc.green("Setup complete!"));
}
const BRIGHTDATA_AFFILIATE = "https://get.brightdata.com/67h1b7h0shcn";
const OLOSTEP_AFFILIATE = "https://olostep.com/?ref=elmo";
const PROVIDERS_DOC_URL = "https://docs.elmohq.com/docs/user-guide/providers";
const BRIGHTDATA_MODELS = [
	"chatgpt",
	"google-ai-mode",
	"perplexity",
	"copilot",
	"gemini",
	"grok"
];
const OLOSTEP_MODELS = [
	"chatgpt",
	"google-ai-mode",
	"google-ai-overview",
	"perplexity",
	"copilot",
	"gemini",
	"grok"
];
const DEFAULT_SCRAPER_MODELS = ["chatgpt", "google-ai-mode"];
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6";
const DEFAULT_MISTRAL_MODEL = "mistral-medium-latest";
async function configureProvidersInteractive(env) {
	p.note([
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
		"Pricing assumes Elmo's default cadence (5 runs/day × 2 surfaces)."
	].join("\n"), "AI providers");
	const mode = await p.select({
		message: "Setup mode",
		options: [{
			value: "recommended",
			label: "Recommended — one scraper + one direct API"
		}, {
			value: "custom",
			label: "Custom — pick each provider individually"
		}],
		initialValue: "recommended"
	});
	assertNotCancelled(mode);
	if (mode === "recommended") await configureProvidersRecommended(env);
	else await configureProvidersCustom(env);
	return mode;
}
async function configureProvidersRecommended(env) {
	const targets = [];
	const scraper = await p.select({
		message: "Scraper (tracks ChatGPT + Google AI Mode)",
		options: [{
			value: "brightdata",
			label: "BrightData — ~$0.45/mo per prompt (cheaper)"
		}, {
			value: "olostep",
			label: "Olostep — ~$2.25/mo per prompt (premium)"
		}],
		initialValue: "brightdata"
	});
	assertNotCancelled(scraper);
	await collectScraperKey(scraper, env);
	for (const model of DEFAULT_SCRAPER_MODELS) targets.push(formatScrapeTarget({
		model,
		provider: scraper,
		webSearch: true
	}));
	const direct = await p.select({
		message: "Direct LLM API (powers onboarding analysis + sentiment scoring)",
		options: [
			{
				value: "openrouter",
				label: "OpenRouter — one key, all major models (recommended)"
			},
			{
				value: "anthropic",
				label: "Anthropic — direct Claude"
			},
			{
				value: "openai",
				label: "OpenAI — direct GPT-* models"
			},
			{
				value: "mistral",
				label: "Mistral — direct Mistral models"
			}
		],
		initialValue: "openrouter"
	});
	assertNotCancelled(direct);
	await collectDirectApiQuick(direct, env);
	await finalizeScrapeTargets(env, targets, { skipEdit: true });
}
async function configureProvidersCustom(env) {
	const targets = [];
	p.log.step(pc.bold("Step 1 of 2 — Direct LLM API (at least one is required)"));
	while (!hasDirectApiConfigured(env)) {
		await collectOpenRouter(env, targets);
		await collectAnthropic(env, targets);
		await collectOpenAI(env, targets);
		await collectMistral(env, targets);
		if (!hasDirectApiConfigured(env)) p.log.warn("Onboarding analysis and other low-latency LLM tasks require a direct API. Configure at least one before continuing.");
	}
	p.log.step(pc.bold("Step 2 of 2 — Scrapers (optional, but needed to track ChatGPT / Google AI Mode)"));
	await collectBrightData(env, targets);
	await collectOlostep(env, targets);
	await collectDataForSEO(env, targets);
	await finalizeScrapeTargets(env, targets);
}
function hasDirectApiConfigured(env) {
	return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.MISTRAL_API_KEY || env.OPENROUTER_API_KEY);
}
async function collectScraperKey(scraper, env) {
	if (scraper === "brightdata") {
		p.log.info(`Sign up: ${link(pc.cyan(BRIGHTDATA_AFFILIATE), BRIGHTDATA_AFFILIATE)}`);
		const key = await p.password({
			message: "BrightData API token",
			validate: (v) => !v ? "Required" : void 0
		});
		assertNotCancelled(key);
		env.BRIGHTDATA_API_TOKEN = key;
	} else {
		p.log.info(`Sign up: ${link(pc.cyan(OLOSTEP_AFFILIATE), OLOSTEP_AFFILIATE)}`);
		const key = await p.password({
			message: "Olostep API key",
			validate: (v) => !v ? "Required" : void 0
		});
		assertNotCancelled(key);
		env.OLOSTEP_API_KEY = key;
	}
}
async function collectDirectApiQuick(kind, env) {
	if (kind === "openrouter") {
		const key = await p.password({
			message: "OpenRouter API key",
			validate: (v) => !v ? "Required" : void 0
		});
		assertNotCancelled(key);
		env.OPENROUTER_API_KEY = key;
	} else if (kind === "anthropic") {
		const key = await p.password({
			message: "Anthropic API key",
			validate: (v) => !v ? "Required" : void 0
		});
		assertNotCancelled(key);
		env.ANTHROPIC_API_KEY = key;
	} else if (kind === "openai") {
		const key = await p.password({
			message: "OpenAI API key",
			validate: (v) => !v ? "Required" : void 0
		});
		assertNotCancelled(key);
		env.OPENAI_API_KEY = key;
	} else {
		const key = await p.password({
			message: "Mistral API key",
			validate: (v) => !v ? "Required" : void 0
		});
		assertNotCancelled(key);
		env.MISTRAL_API_KEY = key;
	}
}
async function collectBrightData(env, targets) {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("BrightData")}? (~$0.45/mo per prompt)`,
		initialValue: true
	});
	assertNotCancelled(enable);
	if (!enable) return;
	p.log.info(`Sign up and generate an API token: ${link(pc.cyan(BRIGHTDATA_AFFILIATE), BRIGHTDATA_AFFILIATE)}`);
	const key = await p.password({
		message: "BrightData API token",
		validate: (v) => !v ? "Required" : void 0
	});
	assertNotCancelled(key);
	env.BRIGHTDATA_API_TOKEN = key;
	await pickScraperTargets({
		providerLabel: "BrightData",
		providerId: "brightdata",
		allModels: BRIGHTDATA_MODELS,
		targets
	});
}
async function collectOlostep(env, targets) {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("Olostep")}? (~$2.25/mo per prompt)`,
		initialValue: false
	});
	assertNotCancelled(enable);
	if (!enable) return;
	p.log.info(`Grab an API key: ${link(pc.cyan(OLOSTEP_AFFILIATE), OLOSTEP_AFFILIATE)}`);
	const key = await p.password({
		message: "Olostep API key",
		validate: (v) => !v ? "Required" : void 0
	});
	assertNotCancelled(key);
	env.OLOSTEP_API_KEY = key;
	await pickScraperTargets({
		providerLabel: "Olostep",
		providerId: "olostep",
		allModels: OLOSTEP_MODELS,
		targets
	});
}
async function pickScraperTargets(args) {
	const selected = await p.multiselect({
		message: `LLM Providers to track via ${args.providerLabel}`,
		options: args.allModels.map((model) => ({
			value: model,
			label: model
		})),
		required: true,
		initialValues: [...DEFAULT_SCRAPER_MODELS]
	});
	assertNotCancelled(selected);
	for (const model of selected) args.targets.push(formatScrapeTarget({
		model,
		provider: args.providerId,
		webSearch: true
	}));
}
async function collectAnthropic(env, targets) {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("Anthropic API")}? (direct Claude — ~$4–5/mo per prompt per model)`,
		initialValue: false
	});
	assertNotCancelled(enable);
	if (!enable) return;
	const key = await p.password({
		message: "Anthropic API key",
		validate: (v) => !v ? "Required" : void 0
	});
	assertNotCancelled(key);
	env.ANTHROPIC_API_KEY = key;
	const model = await p.text({
		message: "Claude model",
		placeholder: DEFAULT_ANTHROPIC_MODEL,
		defaultValue: DEFAULT_ANTHROPIC_MODEL
	});
	assertNotCancelled(model);
	const slug = model || DEFAULT_ANTHROPIC_MODEL;
	const webSearch = await p.confirm({
		message: "Enable web search? (recommended, but more expensive)",
		initialValue: true
	});
	assertNotCancelled(webSearch);
	targets.push(formatScrapeTarget({
		model: "claude",
		provider: "anthropic-api",
		version: slug,
		webSearch
	}));
}
async function collectOpenAI(env, targets) {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("OpenAI API")}? (gpt-* with web search — not the real ChatGPT UI)`,
		initialValue: false
	});
	assertNotCancelled(enable);
	if (!enable) return;
	const key = await p.password({
		message: "OpenAI API key",
		validate: (v) => !v ? "Required" : void 0
	});
	assertNotCancelled(key);
	env.OPENAI_API_KEY = key;
	const model = await p.text({
		message: "OpenAI model",
		placeholder: DEFAULT_OPENAI_MODEL,
		defaultValue: DEFAULT_OPENAI_MODEL
	});
	assertNotCancelled(model);
	const slug = model || DEFAULT_OPENAI_MODEL;
	const webSearch = await p.confirm({
		message: "Enable web search? (recommended, but more expensive)",
		initialValue: true
	});
	assertNotCancelled(webSearch);
	targets.push(formatScrapeTarget({
		model: "chatgpt",
		provider: "openai-api",
		version: slug,
		webSearch
	}));
}
async function collectMistral(env, targets) {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("Mistral API")}? (direct Mistral models)`,
		initialValue: false
	});
	assertNotCancelled(enable);
	if (!enable) return;
	const key = await p.password({
		message: "Mistral API key",
		validate: (v) => !v ? "Required" : void 0
	});
	assertNotCancelled(key);
	env.MISTRAL_API_KEY = key;
	const model = await p.text({
		message: "Mistral model",
		placeholder: DEFAULT_MISTRAL_MODEL,
		defaultValue: DEFAULT_MISTRAL_MODEL
	});
	assertNotCancelled(model);
	const slug = model || DEFAULT_MISTRAL_MODEL;
	const webSearch = await p.confirm({
		message: "Enable web search? (recommended, but more expensive)",
		initialValue: true
	});
	assertNotCancelled(webSearch);
	targets.push(formatScrapeTarget({
		model: "mistral",
		provider: "mistral-api",
		version: slug,
		webSearch
	}));
}
async function collectOpenRouter(env, targets) {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("OpenRouter")}? (one key, many hosted models)`,
		initialValue: false
	});
	assertNotCancelled(enable);
	if (!enable) return;
	const key = await p.password({
		message: "OpenRouter API key",
		validate: (v) => !v ? "Required" : void 0
	});
	assertNotCancelled(key);
	env.OPENROUTER_API_KEY = key;
	const model = await p.text({
		message: "OpenRouter model slug",
		placeholder: DEFAULT_OPENROUTER_MODEL,
		defaultValue: DEFAULT_OPENROUTER_MODEL
	});
	assertNotCancelled(model);
	const slug = model || DEFAULT_OPENROUTER_MODEL;
	const webSearch = await p.confirm({
		message: "Enable web search? (recommended, but more expensive)",
		initialValue: true
	});
	assertNotCancelled(webSearch);
	targets.push(formatScrapeTarget({
		model: "claude",
		provider: "openrouter",
		version: slug,
		webSearch
	}));
}
async function collectDataForSEO(env, targets) {
	const enable = await p.confirm({
		message: `Configure ${pc.bold("DataForSEO")}? (Google AI Mode scraping)`,
		initialValue: false
	});
	assertNotCancelled(enable);
	if (!enable) return;
	const login = await p.text({
		message: "DataForSEO login",
		validate: (v) => !v ? "Required" : void 0
	});
	assertNotCancelled(login);
	env.DATAFORSEO_LOGIN = login;
	const pwd = await p.password({
		message: "DataForSEO password",
		validate: (v) => !v ? "Required" : void 0
	});
	assertNotCancelled(pwd);
	env.DATAFORSEO_PASSWORD = pwd;
	const addTarget = await p.confirm({
		message: "Also scrape Google AI Mode via DataForSEO? (google-ai-mode:dataforseo:online)",
		initialValue: false
	});
	assertNotCancelled(addTarget);
	if (addTarget) targets.push(formatScrapeTarget({
		model: "google-ai-mode",
		provider: "dataforseo",
		webSearch: true
	}));
}
async function finalizeScrapeTargets(env, targets, options = {}) {
	const deduped = dedupeTargets(targets);
	if (!deduped) {
		p.log.warn("No SCRAPE_TARGETS configured. Elmo will not run scheduled checks until you set them.");
		p.log.info(`Reference: ${link(pc.cyan(PROVIDERS_DOC_URL), PROVIDERS_DOC_URL)}`);
		const addManual = await p.confirm({
			message: "Enter SCRAPE_TARGETS manually now?",
			initialValue: false
		});
		assertNotCancelled(addManual);
		if (addManual) {
			const manual = await p.text({
				message: "SCRAPE_TARGETS (model:provider[:version][:online], comma-separated)",
				placeholder: "chatgpt:brightdata:online,google-ai-mode:brightdata:online",
				validate: validateScrapeTargetsInput
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
		initialValue: false
	});
	assertNotCancelled(customize);
	if (customize) {
		p.log.info(`Reference: ${link(pc.cyan(PROVIDERS_DOC_URL), PROVIDERS_DOC_URL)}`);
		const manual = await p.text({
			message: "SCRAPE_TARGETS",
			initialValue: deduped,
			validate: validateScrapeTargetsInput
		});
		assertNotCancelled(manual);
		env.SCRAPE_TARGETS = manual;
		p.log.step(`SCRAPE_TARGETS:\n  ${pc.cyan(manual)}`);
	} else env.SCRAPE_TARGETS = deduped;
}
function validateScrapeTargetsInput(value) {
	if (!value) return "Required";
	try {
		parseScrapeTargets(value);
	} catch (error) {
		return error instanceof Error ? error.message.split("\n")[0] : String(error);
	}
}
function dedupeTargets(targets) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const t of targets) {
		if (seen.has(t)) continue;
		seen.add(t);
		out.push(t);
	}
	return out.join(",");
}
async function doStart(configDir) {
	assertDockerRunning();
	log.step("Starting Docker Compose stack...");
	await runDockerCompose(configDir, ["up", "-d"]);
	const s = p.spinner();
	s.start("Waiting for services to become healthy...");
	if (await waitForHealthy(configDir, 18e4)) s.stop("All services healthy!");
	else {
		s.stop("Health check timed out.");
		p.log.warn("Some services did not report healthy status.");
	}
	log.info("Examples:");
	console.log(`  ${pc.bold("elmo compose logs -f")}`);
	console.log(`  ${pc.bold("elmo compose logs -f web")}`);
	console.log(`  ${pc.bold("elmo compose ps")}`);
	console.log(`  ${pc.bold("elmo compose down")}`);
}
async function runCompose(args, options) {
	const configDir = await resolveConfigDir(options.dir);
	assertDockerRunning();
	await runDockerCompose(configDir, args);
}
async function runEdit(target, options) {
	const configDir = await resolveConfigDir(options.dir);
	let filePath;
	if (target === "env") filePath = path.join(configDir, ".env");
	else if (target === "compose") filePath = path.join(configDir, "elmo.yaml");
	else throw new Error(`Unknown edit target: ${target}. Use \`env\` or \`compose\`.`);
	if (!await fileExists(filePath)) throw new Error(`File not found: ${filePath}`);
	const parts = (process.env.VISUAL || process.env.EDITOR || "nano").split(/\s+/).filter(Boolean);
	const cmd = parts[0] ?? "nano";
	const args = [...parts.slice(1), filePath];
	await new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: "inherit" });
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(/* @__PURE__ */ new Error(`${cmd} exited with code ${code}`));
		});
		child.on("error", (err) => reject(err));
	});
	log.info("Restart the stack with `elmo compose up -d` to apply changes.");
}
function buildComposeYaml(options) {
	const services = [];
	const volumes = /* @__PURE__ */ new Set();
	const dependsOnWeb = [];
	const dependsOnWorker = [];
	const dependencyConditions = {
		postgres: "service_healthy",
		"db-migrate": "service_completed_successfully"
	};
	const dockerfilePath = options.dockerDir ? path.relative(options.repoRoot, path.join(options.dockerDir, "Dockerfile")) : "docker/Dockerfile";
	if (options.postgresMode === "docker") {
		services.push(buildPostgresService());
		services.push(buildDbMigrateService({
			dev: options.dev,
			dockerfilePath,
			repoRoot: options.repoRoot,
			version: options.version
		}));
		dependsOnWeb.push("db-migrate");
		dependsOnWorker.push("db-migrate");
		volumes.add("postgres_data");
	}
	services.push(buildWebService({
		dev: options.dev,
		dependsOn: dependsOnWeb,
		dependencyConditions,
		repoRoot: options.repoRoot,
		dockerfilePath,
		port: options.port,
		version: options.version
	}));
	services.push(buildWorkerService({
		dev: options.dev,
		dependsOn: dependsOnWorker,
		dependencyConditions,
		repoRoot: options.repoRoot,
		dockerfilePath,
		version: options.version
	}));
	const lines = [
		renderedByHeader(options.version),
		"",
		"name: elmo",
		"",
		"services:"
	];
	lines.push(...services.map((service) => indentBlock(service, 2)));
	if (volumes.size > 0) {
		lines.push("", "volumes:");
		for (const volume of volumes) lines.push(`  ${volume}:`);
	}
	return `${lines.join("\n")}\n`;
}
function buildPostgresService() {
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
		"    - \"5432:5432\"",
		"  healthcheck:",
		"    test: [\"CMD-SHELL\", \"pg_isready -U postgres\"]",
		"    interval: 5s",
		"    timeout: 5s",
		"    retries: 5",
		"    start_period: 30s"
	].join("\n");
}
function buildDbMigrateService(options) {
	const lines = ["db-migrate:"];
	if (options.dev) lines.push("  build:", `    context: ${options.repoRoot}`, `    dockerfile: ${options.dockerfilePath}`, "    target: migrate");
	else lines.push(`  image: elmohq/elmo-db-migrate:${options.version}`);
	lines.push("  environment:", "    - DATABASE_URL=postgres://postgres:postgres@postgres:5432/elmo", "  depends_on:", "    postgres:", "      condition: service_healthy");
	return lines.join("\n");
}
function buildWebService(options) {
	const lines = ["web:"];
	if (options.dev) lines.push("  build:", `    context: ${options.repoRoot}`, `    dockerfile: ${options.dockerfilePath}`, "    target: web", "    args:", "      DEPLOYMENT_MODE: local");
	else lines.push(`  image: elmohq/elmo-web:${options.version}`);
	lines.push("  env_file:", "    - path: .env", "      required: true", "  ports:", `    - "${options.port}:3000"`);
	if (options.dependsOn.length > 0) {
		lines.push("  depends_on:");
		for (const service of options.dependsOn) {
			const condition = options.dependencyConditions[service] ?? "service_started";
			lines.push(`    ${service}:`, `      condition: ${condition}`);
		}
	}
	return lines.join("\n");
}
function buildWorkerService(options) {
	const lines = ["worker:"];
	if (options.dev) lines.push("  build:", `    context: ${options.repoRoot}`, `    dockerfile: ${options.dockerfilePath}`, "    target: worker", "    args:", "      DEPLOYMENT_MODE: local");
	else lines.push(`  image: elmohq/elmo-worker:${options.version}`);
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
function indentBlock(block, spaces) {
	const indent = " ".repeat(spaces);
	return block.split("\n").map((line) => `${indent}${line}`).join("\n");
}
async function getComposeServices(configDir) {
	const output = await runDockerComposeCapture(configDir, [
		"ps",
		"--format",
		"json"
	]);
	if (!output.trim()) return [];
	try {
		const trimmed = output.trim();
		const parsed = JSON.parse(trimmed);
		if (Array.isArray(parsed)) return parsed;
		if (typeof parsed === "object" && parsed !== null) return [parsed];
		return [];
	} catch {
		try {
			return output.trim().split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
		} catch {
			log.warn("Unable to parse docker compose status.");
			return [];
		}
	}
}
function isServiceReady(service) {
	if (service.Health) return service.Health === "healthy";
	if (service.State?.startsWith("running")) return true;
	return false;
}
async function waitForHealthy(configDir, timeoutMs) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const services = await getComposeServices(configDir);
		if (services.length > 0 && services.every(isServiceReady)) return true;
		await sleep(3e3);
	}
	return false;
}
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
function runDockerCompose(configDir, args) {
	return new Promise((resolve, reject) => {
		spawn("docker", [
			"compose",
			"-f",
			path.join(configDir, "elmo.yaml"),
			...args
		], { stdio: "inherit" }).on("close", (code) => {
			if (code === 0) resolve();
			else reject(/* @__PURE__ */ new Error(`docker compose exited with code ${code}`));
		});
	});
}
function runDockerComposeCapture(configDir, args) {
	return new Promise((resolve, reject) => {
		const child = spawn("docker", [
			"compose",
			"-f",
			path.join(configDir, "elmo.yaml"),
			...args
		]);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		child.on("close", (code) => {
			if (code === 0) resolve(stdout);
			else reject(new Error(stderr || `docker compose exited with code ${code}`));
		});
	});
}
function assertDockerRunning() {
	if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) throw new Error("Docker does not appear to be running. Start Docker and try again.");
}
async function resolveDockerDirInteractive(cwd) {
	const inCwd = await fileExists(path.join(cwd, "Dockerfile"));
	const inDockerDir = await fileExists(path.join(cwd, "docker", "Dockerfile"));
	const defaultDir = inCwd ? "." : inDockerDir ? "docker" : ".";
	const dir = await p.text({
		message: "Path to docker directory (contains Dockerfile)",
		defaultValue: defaultDir
	});
	assertNotCancelled(dir);
	const resolved = path.resolve(cwd, dir);
	if (!await fileExists(path.join(resolved, "Dockerfile"))) {
		p.log.error(`Dockerfile not found in ${resolved}. Provide the directory that contains Dockerfile.`);
		process.exit(1);
	}
	return resolved;
}
async function resolveConfigDir(explicitDir) {
	const resolved = explicitDir ? path.resolve(process.cwd(), explicitDir) : CONFIG_HOME;
	if (!await fileExists(path.join(resolved, "elmo.yaml"))) {
		if (explicitDir) throw new Error(`Config directory does not contain elmo.yaml: ${resolved}\nRun \`elmo init --dir ${explicitDir}\` to create it.`);
		throw new Error(`No config found at ${resolved}. Run \`elmo init\` to create one, or specify --dir.`);
	}
	return resolved;
}
async function writeConfigFiles(configDir, initConfig) {
	const envPath = path.join(configDir, ".env");
	const composePath = path.join(configDir, "elmo.yaml");
	await ensureDir(configDir);
	await fs.writeFile(envPath, buildEnvFile(initConfig.env, initConfig.version), "utf8");
	await fs.writeFile(composePath, initConfig.composeYaml, "utf8");
}
function renderedByHeader(version) {
	return [`# Rendered by elmo ${version} on ${(/* @__PURE__ */ new Date()).toISOString()}`, "# Re-run `elmo init` after upgrading the CLI to refresh this file."].join("\n");
}
function buildEnvFile(env, version) {
	const lines = [
		renderedByHeader(version),
		"# WARNING: contains secrets. Do not commit.",
		""
	];
	for (const [key, rawValue] of Object.entries(env)) {
		if (rawValue === void 0) continue;
		lines.push(`${key}=${formatEnvValue(rawValue)}`);
	}
	return `${lines.join("\n")}\n`;
}
function formatEnvValue(value) {
	if (value === "") return "\"\"";
	if (/[\s#"']/u.test(value)) return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
	return value;
}
async function fileExists(target) {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}
async function ensureDir(dir) {
	await fs.mkdir(dir, { recursive: true });
}
async function getPackageVersion() {
	const selfDir = path.dirname(fileURLToPath(import.meta.url));
	const packagePath = path.resolve(selfDir, "..", "package.json");
	const contents = await fs.readFile(packagePath, "utf8");
	return JSON.parse(contents).version;
}
async function maybeNotifyNewVersion(currentVersion) {
	try {
		const response = await fetch("https://registry.npmjs.org/@elmohq/cli/latest");
		if (!response.ok) return;
		const data = await response.json();
		if (!data.version) return;
		if (semver.valid(currentVersion) && semver.lt(currentVersion, data.version)) log.warn(`New CLI version available (${data.version}). Run: npm install -g @elmohq/cli@latest`);
	} catch {}
}
main().catch((error) => {
	const msg = error instanceof Error ? error.message : String(error);
	console.error(`\n${pc.red("Error:")} ${msg}`);
	process.exit(1);
});
//#endregion
export {};
