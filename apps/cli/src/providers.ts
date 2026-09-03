import * as p from "@clack/prompts";
import { PROVIDERS_DOCS_URL } from "@workspace/config/constants";
import { formatScrapeTarget, parseScrapeTargets } from "@workspace/config/scrape-targets";
import pc from "picocolors";
import type { EnvMap } from "./config.js";
import { assertNotCancelled, link } from "./util.js";

const CLORO_AFFILIATE = "https://cloro.dev?fpr=elmo";
const BRIGHTDATA_AFFILIATE = "https://get.brightdata.com/67h1b7h0shcn";
const OXYLABS_AFFILIATE = "https://oxylabs.go2cloud.org/aff_c?offer_id=7&aff_id=2263&url_id=32";
const OLOSTEP_AFFILIATE = "https://olostep.com/?ref=elmo";
const DATAFORSEO_AFFILIATE = "https://dataforseo.com/?aff=184966";

export type RecommendedScraper = "cloro" | "brightdata" | "oxylabs" | "olostep" | "dataforseo";
export type DirectApiProvider = "openrouter" | "anthropic" | "openai" | "mistral";

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

export const DEFAULT_SCRAPER_MODELS = ["chatgpt", "google-ai-mode"] as const;
// DataForSEO scrapes wherever it can — the two Google SERP surfaces plus the
// LLM Scraper's ChatGPT and Gemini. Perplexity has no scraper, so it's the one
// surface that goes through the LLM Responses API.
const DATAFORSEO_TARGETS = [
	{ model: "google-ai-mode", kind: "scraper" },
	{ model: "google-ai-overview", kind: "scraper" },
	{ model: "chatgpt", kind: "scraper" },
	{ model: "gemini", kind: "scraper" },
	{ model: "perplexity", kind: "api" },
] as const;

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-5";
const DEFAULT_MISTRAL_MODEL = "mistral-medium-latest";

type Credential = {
	envKey: string;
	message: string;
	/** Masked input for anything that is itself a secret; plain text for logins. */
	secret: boolean;
	validate?: (value: string | undefined) => string | undefined;
};

type TargetPicker = {
	message: string;
	options: { value: string; label: string }[];
	initialValues: string[];
	required: boolean;
};

export type ProviderSpec = {
	id: string;
	kind: "direct" | "scraper";
	/** Bolded in the "Configure X?" question. */
	label: string;
	costHint: string;
	confirmDefault: boolean;
	/** Prefix of the sign-up line shown once the provider is enabled. */
	signup?: { message: string; url: string };
	credentials: Credential[];
	model?: { message: string; default: string };
	webSearch?: boolean;
	/** Single target built from the model answer and the web-search answer. */
	target?: { model: string; provider: string };
	/** Multi-surface picker; every selected value is already a formatted target. */
	picker?: TargetPicker;
};

const required = (v: string | undefined) => (!v ? "Required" : undefined);

function scraperPicker(label: string, provider: string, models: readonly string[]): TargetPicker {
	return {
		message: `LLM Providers to track via ${label}`,
		options: models.map((model) => ({
			value: formatScrapeTarget({ model, provider, webSearch: true }),
			label: model,
		})),
		initialValues: DEFAULT_SCRAPER_MODELS.map((model) => formatScrapeTarget({ model, provider, webSearch: true })),
		required: true,
	};
}

// Order here is the order they're offered everywhere in the wizard, ranked the
// same way the providers doc ranks them. Direct APIs come first: the wizard
// requires one before it will move on to scrapers, and the order within them
// matches the auto-pick preference in onboarding/llm.ts.
export const PROVIDER_PROMPTS: ProviderSpec[] = [
	{
		id: "openrouter",
		kind: "direct",
		label: "OpenRouter",
		costHint: "one key, many hosted models",
		confirmDefault: false,
		credentials: [{ envKey: "OPENROUTER_API_KEY", message: "OpenRouter API key", secret: true, validate: required }],
		model: { message: "OpenRouter model slug", default: DEFAULT_OPENROUTER_MODEL },
		webSearch: true,
		target: { model: "claude", provider: "openrouter" },
	},
	{
		id: "anthropic",
		kind: "direct",
		label: "Anthropic API",
		costHint: "direct Claude — ~$4–5/mo per prompt per model",
		confirmDefault: false,
		credentials: [{ envKey: "ANTHROPIC_API_KEY", message: "Anthropic API key", secret: true, validate: required }],
		model: { message: "Claude model", default: DEFAULT_ANTHROPIC_MODEL },
		webSearch: true,
		target: { model: "claude", provider: "anthropic-api" },
	},
	{
		id: "openai",
		kind: "direct",
		label: "OpenAI API",
		costHint: "gpt-* with web search — not the real ChatGPT UI",
		confirmDefault: false,
		credentials: [{ envKey: "OPENAI_API_KEY", message: "OpenAI API key", secret: true, validate: required }],
		model: { message: "OpenAI model", default: DEFAULT_OPENAI_MODEL },
		webSearch: true,
		target: { model: "chatgpt", provider: "openai-api" },
	},
	{
		id: "mistral",
		kind: "direct",
		label: "Mistral API",
		costHint: "direct Mistral models",
		confirmDefault: false,
		credentials: [{ envKey: "MISTRAL_API_KEY", message: "Mistral API key", secret: true, validate: required }],
		model: { message: "Mistral model", default: DEFAULT_MISTRAL_MODEL },
		webSearch: true,
		target: { model: "mistral", provider: "mistral-api" },
	},
	{
		id: "cloro",
		kind: "scraper",
		label: "Cloro",
		costHint: "most reliable, every surface — ~$0.65/mo per prompt, $30/mo min",
		confirmDefault: true,
		signup: { message: "Sign up and create an API key", url: CLORO_AFFILIATE },
		credentials: [{ envKey: "CLORO_API_KEY", message: "Cloro API key", secret: true, validate: required }],
		picker: scraperPicker("Cloro", "cloro", CLORO_MODELS),
	},
	{
		id: "brightdata",
		kind: "scraper",
		label: "BrightData",
		costHint: "pay-as-you-go, cheaper but slower — ~$0.45/mo per prompt",
		confirmDefault: false,
		signup: { message: "Sign up and generate an API token", url: BRIGHTDATA_AFFILIATE },
		credentials: [
			{ envKey: "BRIGHTDATA_API_TOKEN", message: "BrightData API token", secret: true, validate: required },
		],
		picker: scraperPicker("BrightData", "brightdata", BRIGHTDATA_MODELS),
	},
	{
		id: "oxylabs",
		kind: "scraper",
		label: "Oxylabs",
		costHint: "cheapest per run, no Gemini/Copilot — $49/mo min",
		confirmDefault: false,
		signup: { message: "Sign up and create Web Scraper API credentials", url: OXYLABS_AFFILIATE },
		credentials: [
			{ envKey: "OXYLABS_USERNAME", message: "Oxylabs username", secret: false, validate: required },
			{ envKey: "OXYLABS_PASSWORD", message: "Oxylabs password", secret: true, validate: required },
		],
		picker: scraperPicker("Oxylabs", "oxylabs", OXYLABS_MODELS),
	},
	{
		id: "olostep",
		kind: "scraper",
		label: "Olostep",
		costHint: "premium, built for high volume — ~$2.25/mo per prompt",
		confirmDefault: false,
		signup: { message: "Grab an API key", url: OLOSTEP_AFFILIATE },
		credentials: [{ envKey: "OLOSTEP_API_KEY", message: "Olostep API key", secret: true, validate: required }],
		picker: scraperPicker("Olostep", "olostep", OLOSTEP_MODELS),
	},
	{
		id: "dataforseo",
		kind: "scraper",
		label: "DataForSEO",
		costHint: "pay-as-you-go, scrapers + direct APIs — ~$1.20/mo per prompt",
		confirmDefault: false,
		signup: { message: "Sign up", url: DATAFORSEO_AFFILIATE },
		credentials: [
			{ envKey: "DATAFORSEO_LOGIN", message: "DataForSEO login", secret: false, validate: required },
			{ envKey: "DATAFORSEO_PASSWORD", message: "DataForSEO password", secret: true, validate: required },
		],
		picker: {
			message: "LLM Providers to track via DataForSEO",
			options: DATAFORSEO_TARGETS.map((t) => ({
				value: formatScrapeTarget({ model: t.model, provider: "dataforseo", webSearch: true }),
				label: `${t.model} (${t.kind})`,
			})),
			initialValues: [formatScrapeTarget({ model: "google-ai-mode", provider: "dataforseo", webSearch: true })],
			required: false,
		},
	},
];

export function providerSpec(id: string): ProviderSpec {
	const spec = PROVIDER_PROMPTS.find((candidate) => candidate.id === id);
	if (!spec) throw new Error(`Unknown provider: ${id}`);
	return spec;
}

export async function collectCredentials(spec: ProviderSpec, env: EnvMap): Promise<void> {
	for (const credential of spec.credentials) {
		const options = { message: credential.message, validate: credential.validate };
		const value = credential.secret ? await p.password(options) : await p.text(options);
		assertNotCancelled(value);
		env[credential.envKey] = value;
	}
}

/**
 * Offer one provider: confirm → credentials → optional model + web search →
 * scrape targets. Declining leaves `env` and `targets` untouched.
 */
export async function collectProvider(spec: ProviderSpec, env: EnvMap, targets: string[]): Promise<void> {
	const enable = await p.confirm({
		message: `Configure ${pc.bold(spec.label)}? (${spec.costHint})`,
		initialValue: spec.confirmDefault,
	});
	assertNotCancelled(enable);
	if (!enable) return;

	if (spec.signup) {
		p.log.info(`${spec.signup.message}: ${link(pc.cyan(spec.signup.url), spec.signup.url)}`);
	}

	await collectCredentials(spec, env);

	let version: string | undefined;
	if (spec.model) {
		const model = await p.text({
			message: spec.model.message,
			placeholder: spec.model.default,
			defaultValue: spec.model.default,
		});
		assertNotCancelled(model);
		version = model || spec.model.default;
	}

	let webSearch = true;
	if (spec.webSearch) {
		const answer = await p.confirm({
			message: "Enable web search? (recommended, but more expensive)",
			initialValue: true,
		});
		assertNotCancelled(answer);
		webSearch = answer;
	}

	if (spec.target) {
		targets.push(formatScrapeTarget({ ...spec.target, version, webSearch }));
	}

	if (spec.picker) {
		const selected = (await p.multiselect({
			message: spec.picker.message,
			options: spec.picker.options,
			required: spec.picker.required,
			initialValues: [...spec.picker.initialValues],
		})) as string[] | symbol;
		assertNotCancelled(selected);
		targets.push(...selected);
	}
}

export function hasDirectApiConfigured(env: EnvMap): boolean {
	return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.MISTRAL_API_KEY || env.OPENROUTER_API_KEY);
}

export async function finalizeScrapeTargets(
	env: EnvMap,
	targets: string[],
	options: { skipEdit?: boolean } = {},
): Promise<void> {
	const deduped = dedupeTargets(targets);

	if (!deduped) {
		p.log.warn("No SCRAPE_TARGETS configured. Elmo will not run scheduled checks until you set them.");
		p.log.info(`Reference: ${link(pc.cyan(PROVIDERS_DOCS_URL), PROVIDERS_DOCS_URL)}`);

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
		p.log.info(`Reference: ${link(pc.cyan(PROVIDERS_DOCS_URL), PROVIDERS_DOCS_URL)}`);
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
