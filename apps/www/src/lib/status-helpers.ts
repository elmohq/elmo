export interface StatusEntry {
	ts: string;
	status: "pass" | "fail";
	latency: number;
	retries: number;
	textLength: number;
	rawOutputBytes: number;
	citations: number;
	webQueries: number;
	webSearch: boolean;
	error: string | null;
}

export interface TargetStatus {
	target: string;
	entries: StatusEntry[];
}

export function parseTarget(target: string) {
	const parts = target.split(":");
	const model = parts[0];
	const provider = parts[1];
	const rest = parts.slice(2).join(":");
	// Same split as parseScrapeTargets: everything between the provider and an
	// optional trailing "online" is the version slug.
	const webSearch = parts[parts.length - 1] === "online";
	const versionParts = parts.slice(2, webSearch ? -1 : undefined);
	const version = versionParts.length > 0 ? versionParts.join(":") : undefined;
	return { model, provider, rest, version };
}

export function formatModel(model: string) {
	const names: Record<string, string> = {
		chatgpt: "ChatGPT",
		claude: "Claude",
		gemini: "Gemini",
		grok: "Grok",
		perplexity: "Perplexity",
		copilot: "Copilot",
		deepseek: "DeepSeek",
		kimi: "Kimi",
		mistral: "Mistral",
		"google-ai-mode": "Google AI Mode",
		"google-ai-overview": "Google AI Overview",
	};
	return names[model] || model;
}

export function formatProvider(provider: string) {
	const names: Record<string, string> = {
		cloro: "Cloro",
		brightdata: "BrightData",
		oxylabs: "Oxylabs",
		olostep: "Olostep",
		dataforseo: "DataForSEO",
		"openai-api": "OpenAI API",
		"anthropic-api": "Anthropic API",
		"mistral-api": "Mistral API",
		openrouter: "OpenRouter",
	};
	return names[provider] || provider;
}

// Surfaces the one `dataforseo` provider reaches by scraping — the two Google
// SERP endpoints plus the LLM Scraper's ChatGPT and Gemini. Mirrors
// DATAFORSEO_SCRAPED_MODELS in @workspace/lib.
const DATAFORSEO_SCRAPED_MODELS = new Set(["google-ai-mode", "google-ai-overview", "chatgpt", "gemini"]);

// The three first-party API providers collapse into one "Direct API" filter.
export function providerCategory(provider: string, model: string, version?: string) {
	if (provider === "openai-api" || provider === "anthropic-api" || provider === "mistral-api") return "direct-api";
	// DataForSEO is one provider spanning two kinds of route, and the target
	// picks between them the same way the provider does: pinning a model_name
	// forces the LLM Responses API, otherwise it scrapes wherever it can.
	if (provider === "dataforseo") {
		return !version && DATAFORSEO_SCRAPED_MODELS.has(model) ? "dataforseo-scraper" : "dataforseo-api";
	}
	return provider;
}

// The matrix columns split into two kinds of route: Model APIs (Direct API,
// OpenRouter, DataForSEO API) call an LLM inference endpoint, while AI Search
// Scrapers (Cloro, BrightData, Oxylabs, Olostep, DataForSEO Scraper) scrape a
// live web surface.
export const MODEL_API_CATEGORIES = ["direct-api", "openrouter", "dataforseo-api"];

// Models that only exist as a scraped web surface. Google's AI Mode and AI
// Overview are Search features and Copilot is a consumer assistant — none expose
// an inference endpoint, so a Model API can't reach them at all.
const SCRAPE_ONLY_MODELS = new Set(["google-ai-mode", "google-ai-overview", "copilot"]);

// Which models each provider category has a collector for. A model missing from
// a category's set can't be reached through it — a hard capability gap, not
// merely something Elmo hasn't wired up yet. Mirrors the provider registries in
// @workspace/lib. Categories absent here (direct-api, openrouter) reach any
// model that exposes an inference endpoint.
const PROVIDER_MODELS: Record<string, Set<string>> = {
	cloro: new Set(["chatgpt", "google-ai-mode", "google-ai-overview", "gemini", "copilot", "perplexity"]),
	brightdata: new Set(["chatgpt", "google-ai-mode", "google-ai-overview", "gemini", "copilot", "perplexity"]),
	oxylabs: new Set(["chatgpt", "google-ai-mode", "google-ai-overview", "perplexity"]),
	olostep: new Set(["chatgpt", "google-ai-mode", "google-ai-overview", "gemini", "copilot", "perplexity"]),
	// Google AI Mode and AI Overview come from the SERP endpoints, ChatGPT and
	// Gemini from the LLM Scraper API — all four scrape a live surface. There is
	// no Perplexity scraper on either.
	"dataforseo-scraper": new Set(["google-ai-mode", "google-ai-overview", "chatgpt", "gemini"]),
	// Claude is reachable via LLM Responses but Elmo doesn't track it there.
	"dataforseo-api": new Set(["chatgpt", "perplexity", "gemini", "claude"]),
};

export type CellAvailability = "tracked" | "untracked" | "unavailable";

// Classify a model × provider-category combination independent of run data:
// "tracked" when Elmo runs it, "unavailable" when the combination can't exist,
// "untracked" when it could exist but Elmo doesn't currently run it.
export function cellAvailability(model: string, provider: string, hasTarget: boolean): CellAvailability {
	if (hasTarget) return "tracked";
	// Categories with a fixed collector list reach only those surfaces.
	const reachable = PROVIDER_MODELS[provider];
	if (reachable) return reachable.has(model) ? "untracked" : "unavailable";
	// The unconstrained model APIs reach anything with an inference endpoint —
	// never the scrape-only Search/consumer surfaces.
	if (MODEL_API_CATEGORIES.includes(provider)) {
		return SCRAPE_ONLY_MODELS.has(model) ? "unavailable" : "untracked";
	}
	return "untracked";
}

export const PROVIDER_FILTER_ORDER = [
	"direct-api",
	"openrouter",
	"dataforseo-api",
	"cloro",
	"brightdata",
	"oxylabs",
	"olostep",
	"dataforseo-scraper",
];

export const PROVIDER_FILTER_LABELS: Record<string, string> = {
	"direct-api": "Direct API",
	openrouter: "OpenRouter",
	"dataforseo-api": "DataForSEO API",
	cloro: "Cloro",
	brightdata: "BrightData",
	oxylabs: "Oxylabs",
	olostep: "Olostep",
	"dataforseo-scraper": "DataForSEO Scraper",
};

// In the grouped matrix the column group header already says which kind of route
// a column is, so DataForSEO's two columns don't repeat it.
const GROUPED_COLUMN_LABELS: Record<string, string> = {
	"dataforseo-api": "DataForSEO",
	"dataforseo-scraper": "DataForSEO",
};

export function providerColumnLabel(provider: string, grouped: boolean) {
	const short = grouped ? GROUPED_COLUMN_LABELS[provider] : undefined;
	return short ?? PROVIDER_FILTER_LABELS[provider] ?? provider;
}

// A provider label as it reads mid-sentence. Every scraper and OpenRouter are
// product names, but "Direct API" is a category and takes an article.
export function providerPhrase(provider: string): string {
	const label = PROVIDER_FILTER_LABELS[provider] ?? provider;
	return provider === "direct-api" ? `the ${label}` : label;
}

// Why a combination classified "unavailable" can't exist, phrased for the
// matrix tooltip. Follows cellAvailability's precedence: a category with a fixed
// collector list is bounded by that list whichever kind of route it is, so a
// model API with a short menu (DataForSEO API) reads as a missing endpoint
// rather than the model lacking one.
export function unavailableReason(model: string, provider: string): string {
	const modelLabel = formatModel(model);
	if (PROVIDER_MODELS[provider]) {
		return MODEL_API_CATEGORIES.includes(provider)
			? `${providerPhrase(provider)} has no ${modelLabel} endpoint, so that model can't be reached through it.`
			: `${providerPhrase(provider)} has no ${modelLabel} collector, so that surface can't be reached through it.`;
	}
	return `${modelLabel} has no public inference endpoint — it only exists as a live web surface, so ${providerPhrase(provider)} can't reach it.`;
}

export function formatLatency(ms: number) {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return m > 0 ? `${m}m${(s % 60).toString().padStart(2, "0")}s` : `${s}s`;
}

// Deduplicate entries that are within 5 minutes of each other (same run).
export function dedupeEntries(entries: StatusEntry[]): StatusEntry[] {
	if (entries.length === 0) return [];
	const result: StatusEntry[] = [entries[0]];
	for (let i = 1; i < entries.length; i++) {
		const prev = new Date(result[result.length - 1].ts).getTime();
		const curr = new Date(entries[i].ts).getTime();
		if (curr - prev > 5 * 60 * 1000) {
			result.push(entries[i]);
		}
	}
	return result;
}

export function getLatest(entries: StatusEntry[]): StatusEntry | null {
	if (entries.length === 0) return null;
	return entries[entries.length - 1];
}

// Share of passing runs across the deduped squares of one or many targets —
// the "% green vs total squares" the status page renders as uptime.
export function passRate(targets: TargetStatus[]): number | null {
	let pass = 0;
	let total = 0;
	for (const t of targets) {
		for (const e of dedupeEntries(t.entries)) {
			total++;
			if (e.status === "pass") pass++;
		}
	}
	return total === 0 ? null : (pass / total) * 100;
}

export type RateTier = "up" | "warn" | "down" | "none";

export function rateTier(rate: number | null): RateTier {
	if (rate === null) return "none";
	// Tier off the rounded percentage that gets displayed, so a cell reading
	// "99%" is always green — never amber because the raw rate was 98.6%.
	const pct = Math.round(rate);
	if (pct >= 99) return "up";
	if (pct >= 90) return "warn";
	return "down";
}

// The most recent deduped run for a target, or null if it has never run.
export function latestOf(entries: StatusEntry[]): StatusEntry | null {
	const deduped = dedupeEntries(entries);
	return deduped.length ? deduped[deduped.length - 1] : null;
}

export interface OverallStatus {
	count: number;
	failCount: number;
	operational: boolean;
	uptime: number | null;
	lastChecked: number | null;
}

export function overallStatus(targets: TargetStatus[]): OverallStatus {
	const latests = targets.map((t) => latestOf(t.entries)).filter((e): e is StatusEntry => e !== null);
	const failCount = latests.filter((e) => e.status === "fail").length;
	return {
		count: latests.length,
		failCount,
		operational: latests.length > 0 && failCount === 0,
		uptime: passRate(targets),
		lastChecked: latests.length ? Math.max(...latests.map((e) => new Date(e.ts).getTime())) : null,
	};
}

export interface MetricStats {
	min: number;
	avg: number;
	median: number;
	max: number;
}

export interface RunStats {
	targets: number;
	runs: number;
	passed: number;
	/** Null when nothing succeeded — the per-run numbers would all be zeros. */
	metrics: {
		latency: MetricStats;
		citations: MetricStats;
		webQueries: MetricStats;
		textLength: MetricStats;
		retries: MetricStats;
	} | null;
}

function metricStats(values: number[]): MetricStats {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return {
		min: sorted[0],
		avg: values.reduce((sum, v) => sum + v, 0) / values.length,
		median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
		max: sorted[sorted.length - 1],
	};
}

/**
 * Per-run shape of one or many targets over the loaded window. The run counts
 * cover every deduped square — the same set the success rate is computed from —
 * while the metrics cover only the successful ones, since a failed run's
 * latency is time-to-error and its citations and text are always zero.
 */
export function runStats(targets: TargetStatus[]): RunStats {
	const runs = targets.flatMap((t) => dedupeEntries(t.entries));
	const passing = runs.filter((e) => e.status === "pass");

	return {
		targets: targets.length,
		runs: runs.length,
		passed: passing.length,
		metrics: passing.length
			? {
					latency: metricStats(passing.map((e) => e.latency)),
					citations: metricStats(passing.map((e) => e.citations)),
					webQueries: metricStats(passing.map((e) => e.webQueries)),
					textLength: metricStats(passing.map((e) => e.textLength)),
					retries: metricStats(passing.map((e) => e.retries)),
				}
			: null,
	};
}

export interface MatrixCell {
	rate: number | null;
	down: boolean;
	targets: TargetStatus[];
}

export interface StatusMatrix {
	models: string[];
	providers: string[];
	cell: (model: string, provider: string) => MatrixCell | null;
	availability: (model: string, provider: string) => CellAvailability;
	rowTargets: (model: string) => TargetStatus[];
	colTargets: (provider: string) => TargetStatus[];
}

// A model (rows) by provider-category (columns) grid of uptime, with a `down`
// flag when any target in a cell is currently failing. Cells with no target
// return null so the grid can render a blank. Each cell carries the targets
// behind it, and rows and columns expose theirs, so the aggregate health cells
// and every tooltip re-derive their numbers from one grouping.
export function buildStatusMatrix(data: TargetStatus[]): StatusMatrix {
	const models = [...new Set(data.map((d) => parseTarget(d.target).model))].sort((a, b) =>
		formatModel(a).localeCompare(formatModel(b)),
	);
	const providers = PROVIDER_FILTER_ORDER.filter((c) =>
		data.some((d) => {
			const { model, provider, version } = parseTarget(d.target);
			return providerCategory(provider, model, version) === c;
		}),
	);

	const add = (m: Map<string, TargetStatus[]>, key: string, d: TargetStatus) => {
		const bucket = m.get(key);
		if (bucket) bucket.push(d);
		else m.set(key, [d]);
	};

	const byCell = new Map<string, TargetStatus[]>();
	const byModel = new Map<string, TargetStatus[]>();
	const byProvider = new Map<string, TargetStatus[]>();
	for (const d of data) {
		const { model, provider, version } = parseTarget(d.target);
		const pc = providerCategory(provider, model, version);
		add(byCell, `${model} ${pc}`, d);
		add(byModel, model, d);
		add(byProvider, pc, d);
	}

	return {
		models,
		providers,
		cell(model, provider) {
			const targets = byCell.get(`${model} ${provider}`);
			if (!targets || targets.length === 0) return null;
			return {
				rate: passRate(targets),
				down: targets.some((t) => latestOf(t.entries)?.status === "fail"),
				targets,
			};
		},
		availability(model, provider) {
			const targets = byCell.get(`${model} ${provider}`);
			return cellAvailability(model, provider, !!targets && targets.length > 0);
		},
		rowTargets: (model) => byModel.get(model) ?? [],
		colTargets: (provider) => byProvider.get(provider) ?? [],
	};
}
