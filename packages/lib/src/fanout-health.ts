/**
 * A single run without queries says nothing, so the signal is zero across a
 * whole window. Not a rate threshold: the failures this catches take queries to
 * exactly zero, which needs no per-provider baseline. Partial decay isn't caught.
 */
import type { ModelConfig } from "@workspace/config/scrape-targets";
import { formatScrapeTarget } from "@workspace/config/scrape-targets";

/** At 50 runs, hitting zero by chance needs a search rate under ~20%. */
export const FANOUT_HEALTH_MIN_RUNS = 50;

export interface FanoutRunCounts {
	provider: string;
	model: string;
	runs: number;
	runsWithQueries: number;
}

export interface SilentTarget {
	target: string;
	provider: string;
	model: string;
	runs: number;
}

function countsKey(provider: string, model: string): string {
	return `${provider}:${model}`;
}

/**
 * Driven by configured targets so `exposesWebQueries` sees a real `ModelConfig`
 * — DataForSEO both does and doesn't, depending on surface and version pin.
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
