import { formatScrapeTarget, type ModelConfig, parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getProvider, type Provider } from "@workspace/lib/providers";

export interface ResolvedTarget {
	config: ModelConfig;
	provider: Provider;
	/** Canonical `model:provider[:version][:online]` label. */
	label: string;
}

/**
 * Resolve the `-m/--model` targets for `eval`.
 *
 * `--model` is repeatable and each value may itself be a comma-separated list,
 * so we flatten them all. When none are given we fall back to the deployment's
 * `SCRAPE_TARGETS` (the same set the worker tracks on a schedule).
 *
 * Every target is validated up front — provider must exist, be configured
 * (its API key is present), and accept the model — so we fail fast with a clear
 * message instead of part-way through a long run.
 */
export function resolveTargets(models: string[] | undefined): ResolvedTarget[] {
	const raw = models && models.length > 0 ? models.join(",") : process.env.SCRAPE_TARGETS;
	if (!raw?.trim()) {
		throw new Error(
			"No model targets. Pass one or more with -m (e.g. -m chatgpt:brightdata:online) or set SCRAPE_TARGETS via `elmo init`.",
		);
	}

	const configs = parseScrapeTargets(raw);
	const seen = new Set<string>();
	const resolved: ResolvedTarget[] = [];

	for (const config of configs) {
		const label = formatScrapeTarget(config);
		if (seen.has(label)) continue;
		seen.add(label);

		const provider = getProvider(config.provider);
		if (!provider.isConfigured()) {
			throw new Error(
				`Target "${label}" uses provider "${config.provider}", which is not configured (its API key is missing). Add it with \`elmo edit env\` or export it before running.`,
			);
		}
		const validationError = provider.validateTarget?.(config);
		if (validationError) {
			throw new Error(`Invalid target "${label}": ${validationError}`);
		}

		resolved.push({ config, provider, label });
	}

	return resolved;
}

/**
 * `brainstorm` and `plan` run a single structured-research call, which only
 * direct-API providers support. When the user passes `-m`, point the onboarding
 * provider resolver at it via `ONBOARDING_LLM_TARGET` (the env override the
 * resolver already honors, including its "must support structured research"
 * validation). Returns the chosen provider id for display.
 */
export function applyResearchTarget(model: string | undefined): void {
	if (model?.trim()) {
		process.env.ONBOARDING_LLM_TARGET = model.trim();
	}
}
