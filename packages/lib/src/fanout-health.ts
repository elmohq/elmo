/**
 * Detects a provider that has silently stopped reporting the searches it ran.
 *
 * A single run without queries says nothing — an engine may simply not have
 * searched, and providers write the `unavailable` sentinel for that case just
 * as they do when extraction fails. The two are indistinguishable per row, so
 * the signal has to be an aggregate: a target that reports queries by design,
 * given enough recent runs, should not go a whole window without a single one.
 *
 * Deliberately not a rate threshold. The failure this catches (a vendor renames
 * a field, an SDK moves it) takes queries to exactly zero, and requiring zero
 * over a large sample needs no per-provider baseline to tune. A partial
 * degradation — queries appearing on far fewer runs than usual — needs a
 * historical baseline and isn't covered here.
 */
import type { ModelConfig } from "@workspace/config/scrape-targets";
import { formatScrapeTarget } from "@workspace/config/scrape-targets";

/**
 * Runs are only conclusive in bulk: with a small sample, a target whose engine
 * rarely chooses to search can hit zero on its own. At 50 runs that needs a
 * search rate under ~20% to happen by chance even once in a thousand windows.
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
 * Configured targets that should be reporting queries but reported none.
 *
 * Driven by the deployment's own targets rather than by whatever rows exist, so
 * the caller's `exposesWebQueries` decision is made against the real
 * `ModelConfig` — for DataForSEO the same provider both does and doesn't expose
 * queries depending on the surface and whether the target pins a version.
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
