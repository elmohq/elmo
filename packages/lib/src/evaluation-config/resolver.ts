import type {
	EvaluationEntitlementLimits,
	EffectiveEvaluationTarget,
	EvaluationConfigScope,
	EvaluationTargetForResolution,
	EvaluationTargetResolutionContext,
	EvaluationTargetScopeConfigForResolution,
} from "./types";

export interface EvaluationEntitlementTargetUsage {
	label: string;
	targets: readonly EffectiveEvaluationTarget[];
}

/**
 * Validates configuration-time limits after scope inheritance has been
 * resolved. Runtime quotas deliberately live elsewhere: changing a target
 * selection must not create extra allowance for executions already metered.
 */
export function assertEvaluationEntitlementLimits(input: {
	limits: EvaluationEntitlementLimits;
	configuredTargets: readonly EffectiveEvaluationTarget[];
	brandTargets?: readonly EvaluationEntitlementTargetUsage[];
	promptTargets?: readonly EvaluationEntitlementTargetUsage[];
}): void {
	const { limits, configuredTargets, brandTargets = [], promptTargets = [] } = input;
	if (limits.maxConfiguredTargets !== null && configuredTargets.length > limits.maxConfiguredTargets) {
		throw new Error(
			`Configured target limit exceeded: ${configuredTargets.length} configured, maximum ${limits.maxConfiguredTargets}`,
		);
	}

	const assertCountLimit = (
		usages: readonly EvaluationEntitlementTargetUsage[],
		limit: number | null,
		label: string,
	) => {
		if (limit === null) return;
		for (const usage of usages) {
			if (usage.targets.length > limit) {
				throw new Error(
					`${label} target limit exceeded for ${usage.label}: ${usage.targets.length} configured, maximum ${limit}`,
				);
			}
		}
	};
	assertCountLimit(brandTargets, limits.maxConfiguredTargetsPerBrand, "Brand");
	assertCountLimit(promptTargets, limits.maxConfiguredTargetsPerPrompt, "Prompt");

	if (limits.maxSamplesPerDispatch === null) return;
	for (const usage of [{ label: "configuration", targets: configuredTargets }, ...brandTargets, ...promptTargets]) {
		for (const target of usage.targets) {
			if (target.samplesPerDispatch > limits.maxSamplesPerDispatch) {
				throw new Error(
					`Samples per dispatch limit exceeded for ${usage.label}: ${target.samplesPerDispatch} configured, maximum ${limits.maxSamplesPerDispatch}`,
				);
			}
		}
	}
}

interface ScopeContext {
	scope: EvaluationConfigScope;
	id: string | undefined;
}

function configBelongsToScope(config: EvaluationTargetScopeConfigForResolution, scope: ScopeContext): boolean {
	if (!scope.id || config.scope !== scope.scope) return false;

	switch (scope.scope) {
		case "organization":
			return config.organizationId === scope.id;
		case "brand":
			return config.brandId === scope.id;
		case "prompt":
			return config.promptId === scope.id;
	}
}

function configAppliesToTarget(config: EvaluationTargetScopeConfigForResolution, targetId: string): boolean {
	return config.targetId === null || config.targetId === targetId;
}

function hasPromptAssignment(
	configs: readonly EvaluationTargetScopeConfigForResolution[],
	promptId: string | undefined,
	targetId: string,
): boolean {
	return configs.some(
		(config) =>
			config.scope === "prompt" &&
			config.promptId === promptId &&
			config.targetId === targetId &&
			config.enabled === true,
	);
}

/**
 * Resolve the targets a prompt may execute without joining through every scope
 * at each call site. Scope defaults are applied before target-specific rows;
 * a false enabled value only narrows access, so a child scope cannot restore a
 * provider or model that its parent has disabled.
 */
export function resolveEffectiveEvaluationTargets(
	targets: readonly EvaluationTargetForResolution[],
	configs: readonly EvaluationTargetScopeConfigForResolution[],
	context: EvaluationTargetResolutionContext,
): EffectiveEvaluationTarget[] {
	const scopes: ScopeContext[] = [
		{ scope: "organization", id: context.organizationId },
		{ scope: "brand", id: context.brandId },
		{ scope: "prompt", id: context.promptId },
	];

	const effective: EffectiveEvaluationTarget[] = [];
	for (const target of targets) {
		let enabled = target.enabled && target.providerConnectionEnabled;
		let disabledByAncestor = !enabled;
		let cadenceHours = target.defaultCadenceHours;
		let samplesPerDispatch = target.defaultSamplesPerDispatch;

		for (const scope of scopes) {
			const scopeConfigs = configs.filter(
				(config) => configBelongsToScope(config, scope) && configAppliesToTarget(config, target.id),
			);
			const defaultConfig = scopeConfigs.find((config) => config.targetId === null);
			const targetConfig = scopeConfigs.find((config) => config.targetId === target.id);
			const enabledOverride = targetConfig?.enabled ?? defaultConfig?.enabled;
			if (enabledOverride === false) {
				enabled = false;
				disabledByAncestor = true;
			} else if (enabledOverride === true && !disabledByAncestor) {
				enabled = true;
			}

			// Defaults establish the scope's baseline; a target row refines it.
			scopeConfigs.sort((a, b) => Number(a.targetId !== null) - Number(b.targetId !== null));
			for (const config of scopeConfigs) {
				if (config.cadenceHours !== null) cadenceHours = config.cadenceHours;
				if (config.samplesPerDispatch !== null) samplesPerDispatch = config.samplesPerDispatch;
			}
		}

		if (!enabled) continue;
		if (target.requiresPromptAssignment && !hasPromptAssignment(configs, context.promptId, target.id)) {
			continue;
		}

		effective.push({
			targetId: target.id,
			targetKey: target.key,
			providerConnectionId: target.providerConnectionId,
			model: target.model,
			provider: target.provider,
			version: target.version ?? undefined,
			webSearch: target.webSearch,
			cadenceHours,
			samplesPerDispatch,
		});
	}

	return effective.sort((a, b) => a.targetKey.localeCompare(b.targetKey));
}

export function minimumCadenceHours(targets: readonly EffectiveEvaluationTarget[]): number | undefined {
	if (targets.length === 0) return undefined;
	return Math.min(...targets.map((target) => target.cadenceHours));
}

/**
 * Fold direct target history and pre-migration model-only history into the
 * stable target IDs used by the scheduler. The model fallback is intentionally
 * conservative: during the first cadence after migration it can delay a new
 * target, but cannot create an unexpected extra provider call.
 */
export function mapLastRunsToEffectiveTargets(
	targets: readonly EffectiveEvaluationTarget[],
	history: readonly { evaluationTargetId: string | null; model: string; lastRunAt: Date }[],
): Map<string, Date> {
	const directRuns = new Map<string, Date>();
	const legacyModelRuns = new Map<string, Date>();
	for (const run of history) {
		const runs = run.evaluationTargetId ? directRuns : legacyModelRuns;
		const key = run.evaluationTargetId ?? run.model;
		const previous = runs.get(key);
		if (!previous || run.lastRunAt > previous) runs.set(key, run.lastRunAt);
	}

	const result = new Map<string, Date>();
	for (const target of targets) {
		const direct = directRuns.get(target.targetId);
		const legacy = legacyModelRuns.get(target.model);
		const latest = direct && legacy ? (direct > legacy ? direct : legacy) : (direct ?? legacy);
		if (latest) result.set(target.targetId, latest);
	}
	return result;
}

/** A target is due only after its own cadence has fully elapsed. */
export function selectDueEvaluationTargets(
	targets: readonly EffectiveEvaluationTarget[],
	lastRunAtByTargetId: ReadonlyMap<string, Date>,
	now = new Date(),
): EffectiveEvaluationTarget[] {
	return targets.filter((target) => {
		const lastRunAt = lastRunAtByTargetId.get(target.targetId);
		return !lastRunAt || now.getTime() - lastRunAt.getTime() >= target.cadenceHours * 60 * 60 * 1000;
	});
}

export function isEffectiveEvaluationTargetOverdue(input: {
	target: EffectiveEvaluationTarget;
	lastRunAt?: Date;
	promptCreatedAt: Date;
	now: number;
	graceMs?: number;
}): boolean {
	const reference = input.lastRunAt ?? input.promptCreatedAt;
	return input.now - reference.getTime() > input.target.cadenceHours * 60 * 60 * 1000 + (input.graceMs ?? 0);
}
