import { describe, expect, it } from "vitest";
import { resolveEffectiveEvaluationTargets } from "./resolver";
import type { EvaluationTargetForResolution, EvaluationTargetScopeConfigForResolution } from "./types";

const baseTarget: EvaluationTargetForResolution = {
	id: "target-chatgpt",
	key: "chatgpt-brightdata-online",
	model: "chatgpt",
	provider: "brightdata",
	providerConnectionId: "connection-brightdata",
	providerConnectionEnabled: true,
	version: null,
	webSearch: true,
	enabled: true,
	requiresPromptAssignment: false,
	defaultCadenceHours: 24,
	defaultSamplesPerDispatch: 2,
};

function scopeConfig(
	partial: Partial<EvaluationTargetScopeConfigForResolution>,
): EvaluationTargetScopeConfigForResolution {
	return {
		targetId: null,
		scope: "organization",
		organizationId: "org-1",
		brandId: null,
		promptId: null,
		enabled: null,
		cadenceHours: null,
		samplesPerDispatch: null,
		...partial,
	};
}

describe("resolveEffectiveEvaluationTargets", () => {
	it("does not allow a child scope to restore a target disabled by an organization", () => {
		const effective = resolveEffectiveEvaluationTargets(
			[baseTarget],
			[
				scopeConfig({ targetId: baseTarget.id, enabled: false }),
				scopeConfig({
					scope: "brand",
					organizationId: null,
					brandId: "brand-1",
					targetId: baseTarget.id,
					enabled: true,
				}),
			],
			{ organizationId: "org-1", brandId: "brand-1", promptId: "prompt-1" },
		);

		expect(effective).toEqual([]);
	});

	it("requires an explicit prompt assignment when a target opts into it", () => {
		const target = { ...baseTarget, requiresPromptAssignment: true };

		expect(
			resolveEffectiveEvaluationTargets([target], [], {
				organizationId: "org-1",
				brandId: "brand-1",
				promptId: "prompt-1",
			}),
		).toEqual([]);

		const effective = resolveEffectiveEvaluationTargets(
			[target],
			[
				scopeConfig({
					scope: "prompt",
					organizationId: null,
					brandId: null,
					promptId: "prompt-1",
					targetId: target.id,
					enabled: true,
				}),
			],
			{ organizationId: "org-1", brandId: "brand-1", promptId: "prompt-1" },
		);

		expect(effective).toMatchObject([{ targetId: target.id }]);
	});

	it("uses target-specific values after scope defaults", () => {
		const effective = resolveEffectiveEvaluationTargets(
			[baseTarget],
			[
				scopeConfig({ cadenceHours: 12, samplesPerDispatch: 1 }),
				scopeConfig({ targetId: baseTarget.id, cadenceHours: 6, samplesPerDispatch: 3 }),
			],
			{ organizationId: "org-1" },
		);

		expect(effective).toMatchObject([{ cadenceHours: 6, samplesPerDispatch: 3 }]);
	});

	it("allows an organization to select targets from a disabled organization default", () => {
		const effective = resolveEffectiveEvaluationTargets(
			[baseTarget],
			[scopeConfig({ enabled: false }), scopeConfig({ targetId: baseTarget.id, enabled: true })],
			{ organizationId: "org-1" },
		);

		expect(effective).toMatchObject([{ targetId: baseTarget.id }]);
	});

	it("excludes targets whose provider connection is disabled", () => {
		const effective = resolveEffectiveEvaluationTargets([{ ...baseTarget, providerConnectionEnabled: false }], [], {
			organizationId: "org-1",
		});

		expect(effective).toEqual([]);
	});
});
