import { describe, expect, it } from "vitest";
import { RUNS_PER_PROMPT } from "../constants";
import {
	lastRunKey,
	minCadenceHours,
	parseOrgRunPolicyOverrides,
	resolveTargetRunPolicy,
	selectDueTargets,
	type TargetRunPolicy,
} from "./run-policy";
import type { ModelConfig } from "./types";

function target(overrides: Partial<ModelConfig> = {}): ModelConfig {
	return { model: "chatgpt", provider: "olostep", webSearch: true, ...overrides };
}

const anthropicTarget = target({ model: "claude", provider: "anthropic-api", version: "claude-sonnet-4-6" });

describe("resolveTargetRunPolicy (non-cloud)", () => {
	it("defaults to RUNS_PER_PROMPT at the brand cadence", () => {
		expect(resolveTargetRunPolicy(target(), { deploymentMode: "local", brandCadenceHours: 24 })).toEqual({
			config: target(),
			replication: RUNS_PER_PROMPT,
			cadenceHours: 24,
		});
	});

	it("respects explicit replication and cadence", () => {
		const config = target({ replication: 2, cadenceHours: 6 });
		expect(resolveTargetRunPolicy(config, { deploymentMode: "local", brandCadenceHours: 24 })).toEqual({
			config,
			replication: 2,
			cadenceHours: 6,
		});
	});

	it("lets the target cadence beat the brand override", () => {
		const config = target({ cadenceHours: 48 });
		expect(resolveTargetRunPolicy(config, { deploymentMode: "whitelabel", brandCadenceHours: 6 }).cadenceHours).toBe(
			48,
		);
	});

	it("does not clamp non-cloud replication", () => {
		const config = target({ replication: 9 });
		expect(resolveTargetRunPolicy(config, { deploymentMode: "local", brandCadenceHours: 24 }).replication).toBe(9);
	});
});

describe("resolveTargetRunPolicy (cloud)", () => {
	const cloud = { deploymentMode: "cloud", brandCadenceHours: 24 };

	it("bases anthropic-api targets at 1/day and others at 4/day", () => {
		expect(resolveTargetRunPolicy(anthropicTarget, cloud).replication).toBe(1);
		expect(resolveTargetRunPolicy(target(), cloud).replication).toBe(4);
	});

	it("floors the cadence at 24h even when the brand override is faster", () => {
		expect(
			resolveTargetRunPolicy(target({ cadenceHours: 6 }), { deploymentMode: "cloud", brandCadenceHours: 6 })
				.cadenceHours,
		).toBe(24);
		expect(resolveTargetRunPolicy(target(), { deploymentMode: "cloud", brandCadenceHours: 6 }).cadenceHours).toBe(24);
	});

	it("keeps cadences slower than the floor", () => {
		expect(resolveTargetRunPolicy(target({ cadenceHours: 48 }), cloud).cadenceHours).toBe(48);
	});

	it("clamps env replication to the cloud maximum", () => {
		expect(resolveTargetRunPolicy(target({ replication: 9 }), cloud).replication).toBe(7);
	});

	it("applies standardRunsPerDay only to non-anthropic targets", () => {
		const ctx = { ...cloud, orgOverrides: { standardRunsPerDay: 7 } };
		expect(resolveTargetRunPolicy(target(), ctx).replication).toBe(7);
		expect(resolveTargetRunPolicy(anthropicTarget, ctx).replication).toBe(1);
	});

	it("applies claudeRunsPerDay only to anthropic-api targets", () => {
		const ctx = { ...cloud, orgOverrides: { claudeRunsPerDay: 2 } };
		expect(resolveTargetRunPolicy(anthropicTarget, ctx).replication).toBe(2);
		expect(resolveTargetRunPolicy(target(), ctx).replication).toBe(4);
	});

	it("clamps org overrides to the cloud maximum", () => {
		const ctx = { ...cloud, orgOverrides: { standardRunsPerDay: 12 } };
		expect(resolveTargetRunPolicy(target(), ctx).replication).toBe(7);
	});

	it("prefers the org override over an explicit env replication", () => {
		const ctx = { ...cloud, orgOverrides: { standardRunsPerDay: 6 } };
		expect(resolveTargetRunPolicy(target({ replication: 2 }), ctx).replication).toBe(6);
	});
});

describe("parseOrgRunPolicyOverrides", () => {
	it("returns null for null, empty, invalid JSON, and missing runPolicy", () => {
		expect(parseOrgRunPolicyOverrides(null)).toBeNull();
		expect(parseOrgRunPolicyOverrides(undefined)).toBeNull();
		expect(parseOrgRunPolicyOverrides("")).toBeNull();
		expect(parseOrgRunPolicyOverrides("{not json")).toBeNull();
		expect(parseOrgRunPolicyOverrides("{}")).toBeNull();
		expect(parseOrgRunPolicyOverrides('"string"')).toBeNull();
	});

	it("returns null when runPolicy is not an object", () => {
		expect(parseOrgRunPolicyOverrides('{"runPolicy": 4}')).toBeNull();
		expect(parseOrgRunPolicyOverrides('{"runPolicy": [4]}')).toBeNull();
	});

	it("keeps only finite integer fields >= 1", () => {
		expect(parseOrgRunPolicyOverrides('{"runPolicy": {"standardRunsPerDay": 7, "claudeRunsPerDay": 2}}')).toEqual({
			standardRunsPerDay: 7,
			claudeRunsPerDay: 2,
		});
		expect(parseOrgRunPolicyOverrides('{"runPolicy": {"standardRunsPerDay": 0}}')).toEqual({});
		expect(parseOrgRunPolicyOverrides('{"runPolicy": {"standardRunsPerDay": 1.5}}')).toEqual({});
		expect(parseOrgRunPolicyOverrides('{"runPolicy": {"standardRunsPerDay": "three"}}')).toEqual({});
	});
});

describe("selectDueTargets", () => {
	const now = new Date("2026-07-15T12:00:00Z");
	const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
	const policy = (config: ModelConfig, cadenceHours: number): TargetRunPolicy => ({
		config,
		replication: 1,
		cadenceHours,
	});

	it("marks never-run targets due", () => {
		expect(selectDueTargets([policy(target(), 24)], new Map(), now)).toHaveLength(1);
	});

	it("marks a target due exactly at its cadence", () => {
		const lastRuns = new Map([[lastRunKey("chatgpt", "olostep"), hoursAgo(24)]]);
		expect(selectDueTargets([policy(target(), 24)], lastRuns, now)).toHaveLength(1);
	});

	it("does not mark a target due just under its cadence", () => {
		const lastRuns = new Map([[lastRunKey("chatgpt", "olostep"), hoursAgo(23.9)]]);
		expect(selectDueTargets([policy(target(), 24)], lastRuns, now)).toHaveLength(0);
	});

	it("lets a legacy null-provider row satisfy a (model, provider) target", () => {
		const lastRuns = new Map([[lastRunKey("chatgpt", null), hoursAgo(1)]]);
		expect(selectDueTargets([policy(target(), 24)], lastRuns, now)).toHaveLength(0);
	});

	it("uses the later of the keyed and legacy timestamps", () => {
		const lastRuns = new Map([
			[lastRunKey("chatgpt", "olostep"), hoursAgo(30)],
			[lastRunKey("chatgpt", null), hoursAgo(1)],
		]);
		expect(selectDueTargets([policy(target(), 24)], lastRuns, now)).toHaveLength(0);
	});

	it("filters per target under mixed cadences", () => {
		const daily = policy(target(), 24);
		const claude = policy(anthropicTarget, 48);
		const lastRuns = new Map([
			[lastRunKey("chatgpt", "olostep"), hoursAgo(25)],
			[lastRunKey("claude", "anthropic-api"), hoursAgo(25)],
		]);
		expect(selectDueTargets([daily, claude], lastRuns, now)).toEqual([daily]);
	});
});

describe("minCadenceHours", () => {
	it("picks the minimum cadence", () => {
		const policies = [
			{ config: target(), replication: 1, cadenceHours: 24 },
			{ config: anthropicTarget, replication: 1, cadenceHours: 12 },
		];
		expect(minCadenceHours(policies, 48)).toBe(12);
	});

	it("falls back when empty", () => {
		expect(minCadenceHours([], 48)).toBe(48);
	});
});
