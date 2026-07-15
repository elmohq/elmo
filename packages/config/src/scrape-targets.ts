/**
 * The single module that parses and formats the SCRAPE_TARGETS env var.
 *
 * Format: model:provider[:version][:online][:xN][:Nh]
 * - model: AI model to track (chatgpt, google-ai-mode, copilot, etc.)
 * - provider: How to reach it (olostep, brightdata, oxylabs, dataforseo, openrouter, openai-api, anthropic-api, mistral-api)
 * - version: Specific version slug, required for openrouter and the *-api providers (may contain colons for OpenRouter variants)
 * - :online: Append to enable web search. Omit = no web search.
 * - :xN: Runs per firing for this target (e.g. x4). Omit = deployment default.
 * - :Nh: Hours between firings for this target (e.g. 24h). Omit = brand/env default.
 *
 * The three tail options may appear in any order after the version.
 */

export interface ModelConfig {
	model: string;
	provider: string;
	version?: string;
	webSearch: boolean;
	/** Runs per firing. Unset = deployment default (RUNS_PER_PROMPT). */
	replication?: number;
	/** Hours between firings for this target. Unset = brand/env default. */
	cadenceHours?: number;
}

/**
 * Parse the SCRAPE_TARGETS env var into structured ModelConfig objects.
 *
 * Parsing: split on ":". First = model, second = provider. Tail options
 * ("online", "xN", "Nh") are popped from the end in any order; the remaining
 * middle segments rejoined with ":" = version slug. This naturally handles
 * OpenRouter variant suffixes like ":free".
 */
export function parseScrapeTargets(envValue?: string): ModelConfig[] {
	if (!envValue || !envValue.trim()) {
		throw new Error(
			"SCRAPE_TARGETS environment variable is required. " +
				"Set it to configure which AI models to track. Example:\n" +
				"  SCRAPE_TARGETS=chatgpt:olostep:online,google-ai-mode:olostep:online,copilot:olostep:online\n" +
				"See https://docs.elmohq.com/docs/user-guide/providers for details.",
		);
	}
	return envValue.split(",").map((raw) => {
		const trimmed = raw.trim();
		if (!trimmed) throw new Error("Invalid SCRAPE_TARGETS: empty entry (check for trailing commas)");
		const parts = trimmed.split(":");
		if (parts.length < 2) throw new Error(`Invalid SCRAPE_TARGETS entry: "${trimmed}" (need at least model:provider)`);
		const model = parts[0];
		const provider = parts[1];
		let webSearch = false;
		let replication: number | undefined;
		let cadenceHours: number | undefined;
		const rest = parts.slice(2);
		while (rest.length > 0) {
			const last = rest[rest.length - 1];
			const replicationMatch = /^x(\d+)$/.exec(last);
			const cadenceMatch = /^(\d+)h$/.exec(last);
			if (last === "online") {
				if (webSearch) throw new Error(`Invalid SCRAPE_TARGETS entry "${trimmed}": duplicate online option`);
				webSearch = true;
			} else if (replicationMatch) {
				if (replication !== undefined)
					throw new Error(`Invalid SCRAPE_TARGETS entry "${trimmed}": duplicate replication option`);
				replication = Number(replicationMatch[1]);
				if (replication < 1) throw new Error(`Invalid SCRAPE_TARGETS entry "${trimmed}": replication must be >= 1`);
			} else if (cadenceMatch) {
				if (cadenceHours !== undefined)
					throw new Error(`Invalid SCRAPE_TARGETS entry "${trimmed}": duplicate cadence option`);
				cadenceHours = Number(cadenceMatch[1]);
				if (cadenceHours < 1) throw new Error(`Invalid SCRAPE_TARGETS entry "${trimmed}": cadence must be >= 1 hour`);
			} else {
				break;
			}
			rest.pop();
		}
		const version = rest.length > 0 ? rest.join(":") : undefined;
		return { model, provider, version, webSearch, replication, cadenceHours };
	});
}

/**
 * Inverse of parseScrapeTargets for a single entry: build the canonical
 * model:provider[:version][:online][:xN][:Nh] string from a ModelConfig.
 */
export function formatScrapeTarget(config: ModelConfig): string {
	const parts = [config.model, config.provider];
	if (config.version) parts.push(config.version);
	if (config.webSearch) parts.push("online");
	if (config.replication !== undefined) parts.push(`x${config.replication}`);
	if (config.cadenceHours !== undefined) parts.push(`${config.cadenceHours}h`);
	return parts.join(":");
}
