import type {
	EffectiveEvaluationTarget,
	EvaluationConfigScope,
	EvaluationTargetForResolution,
	EvaluationTargetResolutionContext,
	EvaluationTargetScopeConfigForResolution,
} from "./types";

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
