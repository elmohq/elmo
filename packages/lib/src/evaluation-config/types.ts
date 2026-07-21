import type { ModelConfig } from "@workspace/config/scrape-targets";

export type EvaluationConfigScope = "organization" | "brand" | "prompt";

export interface EvaluationTargetForResolution {
	id: string;
	key: string;
	model: string;
	provider: string;
	providerConnectionId: string;
	providerConnectionEnabled: boolean;
	version: string | null;
	webSearch: boolean;
	enabled: boolean;
	requiresPromptAssignment: boolean;
	defaultCadenceHours: number;
	defaultSamplesPerDispatch: number;
}

export interface EvaluationTargetScopeConfigForResolution {
	targetId: string | null;
	scope: EvaluationConfigScope;
	organizationId: string | null;
	brandId: string | null;
	promptId: string | null;
	enabled: boolean | null;
	cadenceHours: number | null;
	samplesPerDispatch: number | null;
}

export interface EvaluationTargetResolutionContext {
	organizationId?: string;
	brandId?: string;
	promptId?: string;
}

export interface EffectiveEvaluationTarget extends ModelConfig {
	targetId: string;
	targetKey: string;
	providerConnectionId: string;
	cadenceHours: number;
	samplesPerDispatch: number;
}

export interface EvaluationEntitlementLimits {
	maxConfiguredTargets: number | null;
	maxConfiguredTargetsPerBrand: number | null;
	maxConfiguredTargetsPerPrompt: number | null;
	maxSamplesPerDispatch: number | null;
	maxRunsPerDay: number | null;
}
