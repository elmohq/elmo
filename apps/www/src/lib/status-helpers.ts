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
	return { model, provider, rest };
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
		mistral: "Mistral",
		"google-ai-mode": "Google AI Mode",
		"google-ai-overview": "Google AI Overview",
	};
	return names[model] || model;
}

export function formatProvider(provider: string) {
	const names: Record<string, string> = {
		olostep: "Olostep",
		brightdata: "BrightData",
		oxylabs: "Oxylabs",
		dataforseo: "DataForSEO",
		"openai-api": "OpenAI API",
		"anthropic-api": "Anthropic API",
		"mistral-api": "Mistral API",
		openrouter: "OpenRouter",
	};
	return names[provider] || provider;
}

// The three first-party API providers collapse into one "Direct API" filter.
export function providerCategory(provider: string) {
	return provider === "openai-api" ||
		provider === "anthropic-api" ||
		provider === "mistral-api"
		? "direct-api"
		: provider;
}

// The matrix columns split into two kinds of route: Model APIs (Direct API,
// OpenRouter) call an LLM inference endpoint, while AI Search Scrapers (Olostep,
// BrightData, Oxylabs, DataForSEO) scrape a live web surface.
export const MODEL_API_CATEGORIES = ["direct-api", "openrouter"];

// Models that only exist as a scraped web surface. Google's AI Mode and AI
// Overview are Search features and Copilot is a consumer assistant — none expose
// an inference endpoint, so a Model API can't reach them at all.
const SCRAPE_ONLY_MODELS = new Set(["google-ai-mode", "google-ai-overview", "copilot"]);

// Which models each scraper has a collector for. A model missing from a
// scraper's set can't be reached through it — a hard capability gap, not merely
// something Elmo hasn't wired up yet. Mirrors the provider registries in
// @workspace/lib.
const SCRAPER_MODELS: Record<string, Set<string>> = {
	olostep: new Set(["chatgpt", "google-ai-mode", "google-ai-overview", "gemini", "copilot", "perplexity"]),
	brightdata: new Set(["chatgpt", "google-ai-mode", "google-ai-overview", "gemini", "copilot", "perplexity"]),
	oxylabs: new Set(["chatgpt", "google-ai-mode", "google-ai-overview", "perplexity"]),
	dataforseo: new Set(["chatgpt", "google-ai-mode", "google-ai-overview", "gemini", "perplexity"]),
};

export type CellAvailability = "tracked" | "untracked" | "unavailable";

// Classify a model × provider-category combination independent of run data:
// "tracked" when Elmo runs it, "unavailable" when the combination can't exist,
// "untracked" when it could exist but Elmo doesn't currently run it.
export function cellAvailability(
	model: string,
	provider: string,
	hasTarget: boolean,
): CellAvailability {
	if (hasTarget) return "tracked";
	// Model APIs reach only models with an inference endpoint — never the
	// scrape-only Search/consumer surfaces.
	if (MODEL_API_CATEGORIES.includes(provider)) {
		return SCRAPE_ONLY_MODELS.has(model) ? "unavailable" : "untracked";
	}
	// Scrapers reach only the surfaces they have a collector for.
	const scrapeable = SCRAPER_MODELS[provider];
	if (scrapeable && !scrapeable.has(model)) return "unavailable";
	return "untracked";
}

export const PROVIDER_FILTER_ORDER = [
	"direct-api",
	"openrouter",
	"olostep",
	"brightdata",
	"oxylabs",
	"dataforseo",
];

export const PROVIDER_FILTER_LABELS: Record<string, string> = {
	"direct-api": "Direct API",
	openrouter: "OpenRouter",
	olostep: "Olostep",
	brightdata: "BrightData",
	oxylabs: "Oxylabs",
	dataforseo: "DataForSEO",
};

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
	const latests = targets
		.map((t) => latestOf(t.entries))
		.filter((e): e is StatusEntry => e !== null);
	const failCount = latests.filter((e) => e.status === "fail").length;
	return {
		count: latests.length,
		failCount,
		operational: latests.length > 0 && failCount === 0,
		uptime: passRate(targets),
		lastChecked: latests.length
			? Math.max(...latests.map((e) => new Date(e.ts).getTime()))
			: null,
	};
}

export interface MatrixCell {
	rate: number | null;
	down: boolean;
	count: number;
}

export interface StatusMatrix {
	models: string[];
	providers: string[];
	cell: (model: string, provider: string) => MatrixCell | null;
	availability: (model: string, provider: string) => CellAvailability;
	rowRate: (model: string) => number | null;
	colRate: (provider: string) => number | null;
	overall: number | null;
}

// A model (rows) by provider-category (columns) grid of uptime, with a `down`
// flag when any target in a cell is currently failing, plus aggregate health
// per row, per column, and overall. Cells with no target return null so the
// grid can render a blank.
export function buildStatusMatrix(data: TargetStatus[]): StatusMatrix {
	const models = [...new Set(data.map((d) => parseTarget(d.target).model))].sort(
		(a, b) => formatModel(a).localeCompare(formatModel(b)),
	);
	const providers = PROVIDER_FILTER_ORDER.filter((c) =>
		data.some((d) => providerCategory(parseTarget(d.target).provider) === c),
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
		const { model, provider } = parseTarget(d.target);
		const pc = providerCategory(provider);
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
				count: targets.length,
			};
		},
		availability(model, provider) {
			const targets = byCell.get(`${model} ${provider}`);
			return cellAvailability(model, provider, !!targets && targets.length > 0);
		},
		rowRate: (model) => passRate(byModel.get(model) ?? []),
		colRate: (provider) => passRate(byProvider.get(provider) ?? []),
		overall: passRate(data),
	};
}
