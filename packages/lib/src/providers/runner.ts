import type { ModelConfig } from "./types";

/**
 * Filter SCRAPE_TARGETS configs to those a brand has opted into.
 *
 * `enabledModels` is a brand-level allowlist keyed by model name.
 * `null`, `undefined`, or an empty array means "all configured targets run" —
 * the default for brands that haven't explicitly opted in/out.
 */
export function selectTargetsForBrand(
	configs: ModelConfig[],
	enabledModels: string[] | null | undefined,
): ModelConfig[] {
	if (!enabledModels || enabledModels.length === 0) return configs;
	const allowed = new Set(enabledModels);
	return configs.filter((c) => allowed.has(c.model));
}
