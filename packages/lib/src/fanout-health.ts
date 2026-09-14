/**
 * Detects a provider that has silently stopped reporting the searches it ran.
 *
 * A single run without queries says nothing, so the signal is an aggregate:
 * zero across a whole window. Not a rate threshold — the failures this catches
 * (a renamed field, a moved one) take queries to exactly zero, which needs no
 * per-provider baseline. Partial degradation isn't covered.
 */
import type { ModelConfig } from "@workspace/config/scrape-targets";
import { formatScrapeTarget } from "@workspace/config/scrape-targets";

/**
 * At 50 runs, hitting zero by chance needs a search rate under ~20%; below that
 * a target whose engine rarely searches would trip this on its own.
 */
export const FANOUT_HEALTH_MIN_RUNS = 50;

/** Recent-run counts for one (provider, model) pair over the health window. */
export interface FanoutRunCounts {
	provider: string;
	model: string;
	/** Runs with web search on. */
	runs: number;
	/** Of those, runs that reported at least one real query (not the sentinel). */
	runsWithQueries: number;
}

export interface SilentTarget {
	/** The configured target, formatted as it appears in SCRAPE_TARGETS. */
	target: string;
	provider: string;
	model: string;
	runs: number;
}

function countsKey(provider: string, model: string): string {
	return `${provider}:${model}`;
}

/**
 * Driven by configured targets rather than whatever rows exist, so
 * `exposesWebQueries` is decided against a real `ModelConfig` — DataForSEO both
 * does and doesn't expose queries depending on the surface and version pin.
 */
export function findSilentFanoutTargets(
	configs: ModelConfig[],
	counts: FanoutRunCounts[],
	exposesWebQueries: (config: ModelConfig) => boolean,
	minRuns: number = FANOUT_HEALTH_MIN_RUNS,
): SilentTarget[] {
	const byKey = new Map(counts.map((c) => [countsKey(c.provider, c.model), c]));
	const silent: SilentTarget[] = [];

	for (const config of configs) {
		if (!config.webSearch || !exposesWebQueries(config)) continue;
		const observed = byKey.get(countsKey(config.provider, config.model));
		if (!observed || observed.runs < minRuns || observed.runsWithQueries > 0) continue;
		silent.push({
			target: formatScrapeTarget(config),
			provider: config.provider,
			model: config.model,
			runs: observed.runs,
		});
	}

	return silent;
}
