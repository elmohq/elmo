import { describe, expect, it } from "vitest";
import {
	assertEvaluationEntitlementLimits,
	isEffectiveEvaluationTargetOverdue,
	mapLastRunsToEffectiveTargets,
	resolveEffectiveEvaluationTargets,
	selectDueEvaluationTargets,
} from "./resolver";
import type {
	EffectiveEvaluationTarget,
	EvaluationTargetForResolution,
	EvaluationTargetScopeConfigForResolution,
} from "./types";

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

function effectiveTarget(partial: Partial<EffectiveEvaluationTarget> = {}): EffectiveEvaluationTarget {
	return {
		targetId: baseTarget.id,
		targetKey: baseTarget.key,
		providerConnectionId: baseTarget.providerConnectionId,
		model: baseTarget.model,
		provider: baseTarget.provider,
		version: baseTarget.version ?? undefined,
		webSearch: baseTarget.webSearch,
		cadenceHours: baseTarget.defaultCadenceHours,
		samplesPerDispatch: baseTarget.defaultSamplesPerDispatch,
		...partial,
	};
}

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

	it("runs only targets that are due at their own cadence", () => {
		const slowTarget = effectiveTarget({ targetId: "target-slow", targetKey: "target-slow", cadenceHours: 24 });
		const fastTarget = effectiveTarget({ targetId: "target-fast", targetKey: "target-fast", cadenceHours: 6 });
		const now = new Date("2026-07-21T12:00:00.000Z");
		const due = selectDueEvaluationTargets(
			[slowTarget, fastTarget],
			new Map([
				[slowTarget.targetId, new Date("2026-07-21T04:00:00.000Z")],
				[fastTarget.targetId, new Date("2026-07-21T04:00:00.000Z")],
			]),
			now,
		);

		expect(due.map((target) => target.targetId)).toEqual([fastTarget.targetId]);
	});

	it("uses the latest direct or legacy run when bootstrapping target history", () => {
		const target = effectiveTarget();
		const lastRuns = mapLastRunsToEffectiveTargets(
			[target],
			[
				{ evaluationTargetId: null, model: target.model, lastRunAt: new Date("2026-07-21T01:00:00.000Z") },
				{ evaluationTargetId: target.targetId, model: target.model, lastRunAt: new Date("2026-07-21T02:00:00.000Z") },
			],
		);

		expect(lastRuns.get(target.targetId)).toEqual(new Date("2026-07-21T02:00:00.000Z"));
	});

	it("evaluates overdue status against each target cadence", () => {
		const now = new Date("2026-07-21T12:00:00.000Z").getTime();
		expect(
			isEffectiveEvaluationTargetOverdue({
				target: effectiveTarget({ cadenceHours: 24 }),
				lastRunAt: new Date("2026-07-21T04:00:00.000Z"),
				promptCreatedAt: new Date("2026-07-20T00:00:00.000Z"),
				now,
			}),
		).toBe(false);
	});

	it("enforces configured-target and sample limits after resolution", () => {
		const firstTarget = effectiveTarget({ targetId: "target-one", samplesPerDispatch: 2 });
		const secondTarget = effectiveTarget({ targetId: "target-two", samplesPerDispatch: 3 });

		expect(() =>
			assertEvaluationEntitlementLimits({
				limits: {
					maxConfiguredTargets: 2,
					maxConfiguredTargetsPerBrand: 1,
					maxConfiguredTargetsPerPrompt: null,
					maxSamplesPerDispatch: 2,
					maxRunsPerDay: 5,
				},
				configuredTargets: [firstTarget],
				brandTargets: [{ label: "brand-1", targets: [firstTarget, secondTarget] }],
			}),
		).toThrow("Brand target limit exceeded");

		expect(() =>
			assertEvaluationEntitlementLimits({
				limits: {
					maxConfiguredTargets: 2,
					maxConfiguredTargetsPerBrand: 2,
					maxConfiguredTargetsPerPrompt: null,
					maxSamplesPerDispatch: 2,
					maxRunsPerDay: 5,
				},
				configuredTargets: [firstTarget],
				brandTargets: [{ label: "brand-1", targets: [secondTarget] }],
			}),
		).toThrow("Samples per dispatch limit exceeded");
	});
});
