import { PLANS } from "@workspace/config/plans";
import { type ModelConfig, parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { DEFAULT_DELAY_HOURS_FALLBACK, RUNS_PER_PROMPT } from "../constants";
import { selectTargetsForBrand } from "../providers/runner";
import { type Entitlements, UNLIMITED_ENTITLEMENTS, ZERO_ENTITLEMENTS } from "./entitlements";
import {
	type CatalogTarget,
	clampRunsPerDay,
	type ConfigRow,
	type EffectiveTargetsResult,
	type ExclusionReason,
	mergeConfigRows,
	resolveEffectiveTargets,
} from "./resolve-core";

const CUSTOM: Entitlements = { planKey: "custom", ...PLANS.custom };
const PRO: Entitlements = { planKey: "pro", ...PLANS.pro };
const STARTER: Entitlements = { planKey: "starter", ...PLANS.starter };

const ready = () => true;

let seq = 0;

function makeRow(
	scope: string,
	key: string,
	value: unknown,
	extra: Partial<Pick<ConfigRow, "id" | "model" | "targetId">> = {},
): ConfigRow {
	seq += 1;
	return {
		id: `row-${seq}`,
		scope,
		organizationId: null,
		brandId: null,
		promptId: null,
		model: null,
		targetId: null,
		key,
		value,
		...extra,
	};
}

function makeTarget(model: string, provider: string, extra: Partial<CatalogTarget> = {}): CatalogTarget {
	seq += 1;
	return {
		id: `target-${seq}`,
		model,
		provider,
		version: null,
		webSearch: false,
		enabled: true,
		priority: 0,
		requiredEntitlement: null,
		...extra,
	};
}

function reasonsFor(result: EffectiveTargetsResult, targetId: string): ExclusionReason[] | undefined {
	return result.excluded.find((e) => e.target.id === targetId)?.reasons;
}

function runningIds(result: EffectiveTargetsResult): string[] {
	return result.targets.map((t) => t.targetId);
}

// ---------------------------------------------------------------------------
// mergeConfigRows
// ---------------------------------------------------------------------------

describe("mergeConfigRows", () => {
	it("returns every registry default with 'default' provenance when no rows exist", () => {
		const resolved = mergeConfigRows([]);
		expect(Object.keys(resolved).sort()).toEqual(
			["cadenceHours", "enabledModels", "modelEnabled", "modelMode", "onboardingTarget", "replication"].sort(),
		);
		expect(resolved.cadenceHours).toEqual({ value: 24, provenance: "default" });
		expect(resolved.replication).toEqual({ value: 5, provenance: "default" });
		expect(resolved.enabledModels).toEqual({ value: null, provenance: "default" });
		expect(resolved.modelEnabled).toEqual({ value: true, provenance: "default" });
		expect(resolved.modelMode).toEqual({ value: "base", provenance: "default" });
		expect(resolved.onboardingTarget).toEqual({ value: "chatgpt:openai-api", provenance: "default" });
	});

	it("resolves nearer scopes over wider ones (brand > organization > instance)", () => {
		const instance = makeRow("instance", "run.cadence_hours", 6);
		const org = makeRow("organization", "run.cadence_hours", 12);
		const brand = makeRow("brand", "run.cadence_hours", 18);
		expect(mergeConfigRows([instance, org, brand]).cadenceHours.value).toBe(18);
		expect(mergeConfigRows([instance, org]).cadenceHours.value).toBe(12);
		expect(mergeConfigRows([instance]).cadenceHours.value).toBe(6);
	});

	it("lets an org selector-less row beat an instance model-selector row (scope wins first)", () => {
		const instanceClaude = makeRow("instance", "run.cadence_hours", 24, { model: "claude" });
		const orgAll = makeRow("organization", "run.cadence_hours", 3.4, { id: "o-cadence" });
		const resolved = mergeConfigRows([instanceClaude, orgAll], { model: "claude" });
		expect(resolved.cadenceHours.value).toBe(3.4);
		expect(resolved.cadenceHours.provenance).toEqual({ scope: "organization", rowId: "o-cadence" });
	});

	it("ranks selector specificity within one scope: targetId > model > selector-less", () => {
		const none = makeRow("instance", "run.cadence_hours", 24);
		const model = makeRow("instance", "run.cadence_hours", 12, { model: "claude" });
		const target = makeRow("instance", "run.cadence_hours", 6, { targetId: "t-web" });
		const rows = [none, model, target];
		expect(mergeConfigRows(rows, { model: "claude", targetId: "t-web" }).cadenceHours.value).toBe(6);
		expect(mergeConfigRows(rows, { model: "claude", targetId: "t-base" }).cadenceHours.value).toBe(12);
		expect(mergeConfigRows(rows, { model: "chatgpt", targetId: "t-x" }).cadenceHours.value).toBe(24);
	});

	it("ignores selector rows that do not match the resolution context", () => {
		const gemini = makeRow("instance", "run.cadence_hours", 2, { model: "gemini" });
		const target = makeRow("instance", "run.cadence_hours", 3, { targetId: "t-1" });
		// Neither selector matches a bare claude context — fall through to default.
		const resolved = mergeConfigRows([gemini, target], { model: "claude" });
		expect(resolved.cadenceHours).toEqual({ value: 24, provenance: "default" });
	});

	it("falls back to the code default when a winning row's value fails the registry schema", () => {
		const corruptCadence = makeRow("instance", "run.cadence_hours", "soon");
		const corruptPicks = makeRow("brand", "run.enabled_models", 42);
		const resolved = mergeConfigRows([corruptCadence, corruptPicks]);
		expect(resolved.cadenceHours).toEqual({ value: 24, provenance: "default" });
		expect(resolved.enabledModels).toEqual({ value: null, provenance: "default" });
	});

	it("ignores rows for keys not in the registry", () => {
		const resolved = mergeConfigRows([makeRow("instance", "run.bogus", 99)]);
		expect(Object.keys(resolved)).toHaveLength(6);
		expect(resolved.bogus).toBeUndefined();
	});

	it("reports provenance with rowId and the row's selector", () => {
		const none = makeRow("instance", "run.replication", 2, { id: "r-none" });
		const model = makeRow("instance", "run.cadence_hours", 12, { id: "r-model", model: "claude" });
		const target = makeRow("instance", "run.model_mode", "web", { id: "r-target", targetId: "t-1" });
		const resolved = mergeConfigRows([none, model, target], { model: "claude", targetId: "t-1" });
		expect(resolved.replication.provenance).toEqual({ scope: "instance", rowId: "r-none" });
		expect(resolved.cadenceHours.provenance).toEqual({
			scope: "instance",
			rowId: "r-model",
			selector: { model: "claude" },
		});
		expect(resolved.modelMode.provenance).toEqual({
			scope: "instance",
			rowId: "r-target",
			selector: { targetId: "t-1" },
		});
	});

	it("applies the replace rule for enabled_models: the row's list replaces the null default wholesale", () => {
		const picks = makeRow("brand", "run.enabled_models", ["chatgpt"], { id: "b-picks" });
		const resolved = mergeConfigRows([picks]);
		expect(resolved.enabledModels.value).toEqual(["chatgpt"]);
		expect(resolved.enabledModels.provenance).toEqual({ scope: "brand", rowId: "b-picks" });
	});
});

// ---------------------------------------------------------------------------
// clampRunsPerDay (A6 arithmetic)
// ---------------------------------------------------------------------------

describe("clampRunsPerDay", () => {
	it("leaves values untouched when within the ceiling", () => {
		expect(clampRunsPerDay({ cadenceHours: 6, replication: 1, ceiling: 4 })).toEqual({
			cadenceHours: 6,
			replication: 1,
			clamped: false,
			requestedRunsPerDay: 4,
			effectiveRunsPerDay: 4,
		});
	});

	it("stretches cadence first, preserving replication, landing exactly on the ceiling", () => {
		const result = clampRunsPerDay({ cadenceHours: 12, replication: 3, ceiling: 4 });
		expect(result.clamped).toBe(true);
		expect(result.replication).toBe(3);
		expect(result.cadenceHours).toBe(18); // 24 × 3 / 4
		expect(result.effectiveRunsPerDay).toBe(4);
	});

	it("reduces replication only once cadence is at its 24h floor", () => {
		const result = clampRunsPerDay({ cadenceHours: 24, replication: 5, ceiling: 4 });
		expect(result).toMatchObject({ cadenceHours: 24, replication: 4, clamped: true, effectiveRunsPerDay: 4 });
	});

	it("produces the #340 shape: exactly N runs per day for over-budget inputs", () => {
		// 24 runs/day requested, ceiling 4 → cadence 6h, still 1 sample per firing.
		expect(clampRunsPerDay({ cadenceHours: 1, replication: 1, ceiling: 4 })).toMatchObject({
			cadenceHours: 6,
			replication: 1,
			effectiveRunsPerDay: 4,
		});
		// Replication alone over the ceiling → floor(ceiling) once per day.
		expect(clampRunsPerDay({ cadenceHours: 12, replication: 5, ceiling: 2 })).toMatchObject({
			cadenceHours: 24,
			replication: 2,
			effectiveRunsPerDay: 2,
		});
	});

	it("clamps to zero runs when the ceiling is zero", () => {
		expect(clampRunsPerDay({ cadenceHours: 24, replication: 5, ceiling: 0 })).toMatchObject({
			cadenceHours: 24,
			replication: 0,
			effectiveRunsPerDay: 0,
		});
	});

	it("never exceeds the ceiling and keeps the arithmetic self-consistent across a grid", () => {
		const cadences = [0.5, 1, 2, 3, 4, 6, 8, 12, 24, 48];
		const replications = [1, 2, 3, 5, 8];
		const ceilings = [0, 1, 2, 4, 5, 7, 10];
		for (const cadenceHours of cadences) {
			for (const replication of replications) {
				for (const ceiling of ceilings) {
					const result = clampRunsPerDay({ cadenceHours, replication, ceiling });
					const requested = (replication * 24) / cadenceHours;
					expect(result.effectiveRunsPerDay).toBeLessThanOrEqual(ceiling + 1e-9);
					// Effective rate always equals the returned policy's own rate.
					expect((result.replication * 24) / result.cadenceHours).toBeCloseTo(result.effectiveRunsPerDay, 9);
					if (requested <= ceiling) {
						expect(result).toEqual({
							cadenceHours,
							replication,
							clamped: false,
							requestedRunsPerDay: requested,
							effectiveRunsPerDay: requested,
						});
					} else if (replication <= ceiling) {
						// Cadence stretch: replication preserved, lands exactly on the ceiling.
						expect(result.replication).toBe(replication);
						expect(result.effectiveRunsPerDay).toBeCloseTo(ceiling, 9);
					} else {
						expect(result.cadenceHours).toBe(24);
						expect(result.replication).toBe(Math.floor(ceiling));
					}
				}
			}
		}
	});
});

// ---------------------------------------------------------------------------
// resolveEffectiveTargets — legacy semantics / non-cloud zero change
// ---------------------------------------------------------------------------

const LEGACY_TARGETS =
	"chatgpt:brightdata:online,google-ai-mode:olostep:online," +
	"claude:anthropic-api:claude-sonnet-4-6:online,claude:anthropic-api:claude-sonnet-4-6," +
	"deepseek:openrouter:deepseek/deepseek-v3.2";
const legacyConfigs = parseScrapeTargets(LEGACY_TARGETS);
const legacyCatalog = legacyConfigs.map((c) =>
	makeTarget(c.model, c.provider, { version: c.version ?? null, webSearch: c.webSearch }),
);

function fingerprint(model: string, provider: string, version: string | undefined, webSearch: boolean): string {
	return `${model}|${provider}|${version ?? ""}|${webSearch}`;
}

function resolverFingerprints(result: EffectiveTargetsResult): string[] {
	return result.targets.map((t) => fingerprint(t.model, t.provider, t.version, t.webSearch)).sort();
}

function legacyFingerprints(selected: ModelConfig[]): string[] {
	return selected.map((c) => fingerprint(c.model, c.provider, c.version, c.webSearch)).sort();
}

function resolveLegacy(enabledModels: string[] | null, level: "brand" | "prompt" = "brand"): EffectiveTargetsResult {
	const rows = enabledModels === null ? [] : [makeRow("brand", "run.enabled_models", enabledModels)];
	return resolveEffectiveTargets({
		catalog: legacyCatalog,
		entitlements: UNLIMITED_ENTITLEMENTS,
		rows,
		level,
		credentialsReady: ready,
	});
}

describe("resolveEffectiveTargets — legacy enabled_models semantics (non-cloud)", () => {
	it("runs every catalog target when no enabled_models row exists (absent = all)", () => {
		const result = resolveLegacy(null);
		expect(resolverFingerprints(result)).toEqual(legacyFingerprints(selectTargetsForBrand(legacyConfigs, null)));
		expect(result.excluded).toEqual([]);
	});

	it("matches today's defaults exactly: cadence 24h, replication 5, no clamps", () => {
		const result = resolveLegacy(null);
		expect(result.targets).toHaveLength(legacyConfigs.length);
		for (const target of result.targets) {
			expect(target.runPolicy).toEqual({ cadenceHours: DEFAULT_DELAY_HOURS_FALLBACK, replication: RUNS_PER_PROMPT });
			expect(target.provenance.cadenceHours).toBe("default");
			expect(target.provenance.replication).toBe("default");
			expect(target.provenance.clamp).toBeUndefined();
		}
	});

	it("runs nothing for an explicit empty list ([] = none)", () => {
		const result = resolveLegacy([]);
		expect(result.targets).toEqual([]);
		expect(resolverFingerprints(result)).toEqual(legacyFingerprints(selectTargetsForBrand(legacyConfigs, [])));
		for (const excluded of result.excluded) {
			expect(excluded.reasons).toEqual(["not-picked-by-brand"]);
		}
	});

	it("intersects a subset pick with the catalog — claude stays brand-pickable outside cloud", () => {
		const picks = ["chatgpt", "claude"];
		const result = resolveLegacy(picks);
		expect(resolverFingerprints(result)).toEqual(legacyFingerprints(selectTargetsForBrand(legacyConfigs, picks)));
		expect(result.targets.filter((t) => t.model === "claude")).toHaveLength(2);
	});

	it("resolves identically at prompt level when the prompt has no override rows", () => {
		const brand = resolveLegacy(["chatgpt", "deepseek"], "brand");
		const prompt = resolveLegacy(["chatgpt", "deepseek"], "prompt");
		expect(resolverFingerprints(prompt)).toEqual(resolverFingerprints(brand));
	});

	it("never pool-excludes an assignable model outside cloud, whatever the usage count", () => {
		const result = resolveEffectiveTargets({
			catalog: legacyCatalog,
			entitlements: UNLIMITED_ENTITLEMENTS,
			rows: [],
			level: "prompt",
			credentialsReady: ready,
			assignablePoolUsage: 999_999,
		});
		expect(result.targets.filter((t) => t.model === "claude")).toHaveLength(2);
	});

	it("runs entitlement-flagged targets when the flags are open (non-cloud)", () => {
		const catalog = [
			makeTarget("chatgpt", "openai-api", { requiredEntitlement: "webSearchApiTargets", webSearch: true }),
			makeTarget("acme-llm", "openrouter", { requiredEntitlement: "custom" }),
		];
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: UNLIMITED_ENTITLEMENTS,
			rows: [],
			level: "brand",
			credentialsReady: ready,
		});
		expect(result.targets).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// resolveEffectiveTargets — the §3a worked example (cloud)
// ---------------------------------------------------------------------------

describe("resolveEffectiveTargets — worked example (custom org at 7×/day)", () => {
	const catalog = [
		makeTarget("chatgpt", "brightdata", { id: "t-chatgpt", webSearch: true }),
		makeTarget("claude", "anthropic-api", { id: "t-claude-web", version: "claude-sonnet-4-6", webSearch: true }),
		makeTarget("claude", "anthropic-api", { id: "t-claude-base", version: "claude-sonnet-4-6" }),
		makeTarget("deepseek", "openrouter", { id: "t-deepseek", version: "deepseek/deepseek-v3.2" }),
	];
	const instanceRows = [
		makeRow("instance", "run.cadence_hours", 6, { id: "i-cadence" }),
		makeRow("instance", "run.replication", 1, { id: "i-rep" }),
		makeRow("instance", "run.cadence_hours", 24, { id: "i-claude-cadence", model: "claude" }),
	];
	const orgRow = makeRow("organization", "run.cadence_hours", 3.4, { id: "o-cadence" });

	it("resolves claude from the org override, then the plan ceiling claws it back to 1×/day", () => {
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: CUSTOM,
			rows: [...instanceRows, orgRow],
			level: "prompt",
			credentialsReady: ready,
		});
		expect(runningIds(result).sort()).toEqual(["t-chatgpt", "t-claude-base", "t-claude-web", "t-deepseek"]);

		const claude = result.targets.find((t) => t.targetId === "t-claude-web");
		expect(claude).toBeDefined();
		if (!claude) return;
		// Effective: exactly 1×/day — cadence stretched to 24h, replication kept.
		expect(claude.runPolicy).toEqual({ cadenceHours: 24, replication: 1 });
		// Provenance: value from the org override…
		expect(claude.provenance.cadenceHours).toEqual({ scope: "organization", rowId: "o-cadence" });
		// …clamped by the plan ceiling (claude).
		expect(claude.provenance.clamp).toMatchObject({
			clampedBy: "plan-ceiling",
			model: "claude",
			ceiling: 1,
			effectiveRunsPerDay: 1,
		});
		expect(claude.provenance.clamp?.requestedRunsPerDay).toBeCloseTo(24 / 3.4, 9);
	});

	it("resolves chatgpt from the same org row to 7×/day under the '*' ceiling", () => {
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: CUSTOM,
			rows: [...instanceRows, orgRow],
			level: "prompt",
			credentialsReady: ready,
		});
		const chatgpt = result.targets.find((t) => t.targetId === "t-chatgpt");
		expect(chatgpt).toBeDefined();
		if (!chatgpt) return;
		expect(chatgpt.runPolicy.replication).toBe(1);
		expect(chatgpt.runPolicy.cadenceHours).toBeCloseTo(24 / 7, 9);
		expect((chatgpt.runPolicy.replication * 24) / chatgpt.runPolicy.cadenceHours).toBeCloseTo(7, 9);
	});

	it("resolves a starter org (no org row) to the instance 4×/day, coinciding with its ceiling — no clamp", () => {
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: STARTER,
			rows: instanceRows,
			level: "prompt",
			credentialsReady: ready,
		});
		const chatgpt = result.targets.find((t) => t.targetId === "t-chatgpt");
		expect(chatgpt).toBeDefined();
		if (!chatgpt) return;
		expect(chatgpt.runPolicy).toEqual({ cadenceHours: 6, replication: 1 });
		expect(chatgpt.provenance.clamp).toBeUndefined();
		// Starter's claude pool is 0, so claude never has an assignment to run.
		expect(reasonsFor(result, "t-claude-web")).toEqual(["pool-exhausted"]);
		expect(reasonsFor(result, "t-claude-base")).toEqual(["pool-exhausted"]);
	});
});

// ---------------------------------------------------------------------------
// resolveEffectiveTargets — model classes (A4) and the claude pool (A5)
// ---------------------------------------------------------------------------

describe("resolveEffectiveTargets — model classes and the claude pool (cloud)", () => {
	const claudeWeb = makeTarget("claude", "anthropic-api", { id: "c-web", webSearch: true });
	const claudeBase = makeTarget("claude", "anthropic-api", { id: "c-base" });
	const chatgpt = makeTarget("chatgpt", "brightdata", { id: "c-chatgpt", webSearch: true });
	const catalog = [claudeWeb, claudeBase, chatgpt];

	function resolvePrompt(rows: ConfigRow[], poolUsage: number): EffectiveTargetsResult {
		return resolveEffectiveTargets({
			catalog,
			entitlements: PRO,
			rows,
			level: "prompt",
			credentialsReady: ready,
			assignablePoolUsage: poolUsage,
		});
	}

	it("never lets a brand pick an assignable model in cloud, even via enabled_models", () => {
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: PRO,
			rows: [makeRow("brand", "run.enabled_models", ["claude", "chatgpt"])],
			level: "brand",
			credentialsReady: ready,
		});
		expect(runningIds(result)).toEqual(["c-chatgpt"]);
		expect(reasonsFor(result, "c-web")).toEqual(["not-picked-by-brand"]);
		expect(reasonsFor(result, "c-base")).toEqual(["not-picked-by-brand"]);
	});

	it("runs the web variant for a prompt assigned in web mode; the base variant stays off", () => {
		const rows = [
			makeRow("prompt", "run.model_enabled", true, { model: "claude" }),
			makeRow("prompt", "run.model_mode", "web", { model: "claude" }),
		];
		const result = resolvePrompt(rows, 5);
		expect(runningIds(result)).toContain("c-web");
		expect(reasonsFor(result, "c-base")).toEqual(["not-picked-by-brand"]);
	});

	it("defaults an assignment without a mode row to base", () => {
		const result = resolvePrompt([makeRow("prompt", "run.model_enabled", true, { model: "claude" })], 5);
		expect(runningIds(result)).toContain("c-base");
		expect(reasonsFor(result, "c-web")).toEqual(["not-picked-by-brand"]);
	});

	it("treats an explicit model_mode row alone as the assignment (what the pool count counts)", () => {
		const result = resolvePrompt([makeRow("prompt", "run.model_mode", "web", { model: "claude" })], 5);
		expect(runningIds(result)).toContain("c-web");
	});

	it("keeps an existing assignment running at full pool, but pool-excludes unassigned prompts", () => {
		const assignedRows = [
			makeRow("prompt", "run.model_enabled", true, { model: "claude" }),
			makeRow("prompt", "run.model_mode", "web", { model: "claude" }),
		];
		// This prompt's own assignment is part of the counted usage — it still runs.
		const assigned = resolvePrompt(assignedRows, PRO.claudePromptPool);
		expect(runningIds(assigned)).toContain("c-web");

		// A prompt with no assignment sees the pool as full: a new add is blocked.
		const unassigned = resolvePrompt([], PRO.claudePromptPool);
		expect(reasonsFor(unassigned, "c-web")).toEqual(["pool-exhausted"]);
		expect(reasonsFor(unassigned, "c-base")).toEqual(["pool-exhausted"]);
	});

	it("reports an unassigned prompt as not-picked (not pool-exhausted) while headroom remains", () => {
		const result = resolvePrompt([], PRO.claudePromptPool - 1);
		expect(reasonsFor(result, "c-web")).toEqual(["not-picked-by-brand"]);
	});

	it("prompt-disables an assignable model on an explicit model_enabled=false row", () => {
		const rows = [
			makeRow("prompt", "run.model_enabled", false, { model: "claude" }),
			makeRow("prompt", "run.model_mode", "web", { model: "claude" }),
		];
		const result = resolvePrompt(rows, 5);
		expect(reasonsFor(result, "c-web")).toEqual(["prompt-disabled"]);
		expect(reasonsFor(result, "c-base")).toEqual(["prompt-disabled"]);
	});

	it("lets a prompt subtract a standard model but not add one the brand didn't pick", () => {
		const rows = [
			makeRow("brand", "run.enabled_models", ["chatgpt"]),
			makeRow("prompt", "run.model_enabled", false, { model: "chatgpt" }),
		];
		const subtracted = resolveEffectiveTargets({
			catalog,
			entitlements: PRO,
			rows,
			level: "prompt",
			credentialsReady: ready,
		});
		expect(reasonsFor(subtracted, "c-chatgpt")).toEqual(["prompt-disabled"]);

		// A4: prompt-level *adds* are assignable-class only — a standard model the
		// brand excluded stays excluded despite model_enabled=true.
		const readded = resolveEffectiveTargets({
			catalog: [chatgpt, makeTarget("deepseek", "openrouter", { id: "c-deepseek" })],
			entitlements: PRO,
			rows: [
				makeRow("brand", "run.enabled_models", ["chatgpt"]),
				makeRow("prompt", "run.model_enabled", true, { model: "deepseek" }),
			],
			level: "prompt",
			credentialsReady: ready,
		});
		expect(reasonsFor(readded, "c-deepseek")).toEqual(["not-picked-by-brand"]);
	});

	it("zero entitlements: menu empties the standard class and the pool blocks assignable adds", () => {
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: ZERO_ENTITLEMENTS,
			rows: [],
			level: "prompt",
			credentialsReady: ready,
			assignablePoolUsage: 0,
		});
		expect(result.targets).toEqual([]);
		expect(reasonsFor(result, "c-chatgpt")).toEqual(["not-in-plan-menu"]);
		expect(reasonsFor(result, "c-web")).toEqual(["pool-exhausted"]);
	});
});

// ---------------------------------------------------------------------------
// resolveEffectiveTargets — exclusion reasons (B2)
// ---------------------------------------------------------------------------

describe("resolveEffectiveTargets — exclusion reasons", () => {
	it("surfaces every exclusion reason exactly where it applies", () => {
		const catalog = [
			makeTarget("chatgpt", "brightdata", { id: "x-disabled", enabled: false }),
			makeTarget("gemini", "unready-prov", { id: "x-unready" }),
			makeTarget("perplexity", "openai-api", { id: "x-entitle", requiredEntitlement: "webSearchApiTargets" }),
			makeTarget("grok", "openrouter", { id: "x-menu" }),
			makeTarget("deepseek", "openrouter", { id: "x-unpicked" }),
			makeTarget("copilot", "olostep", { id: "x-prompt-off" }),
			makeTarget("claude", "anthropic-api", { id: "x-pool" }),
			makeTarget("qwen", "openrouter", { id: "x-runs" }),
		];
		const rows = [
			makeRow("brand", "run.enabled_models", ["chatgpt", "gemini", "perplexity", "grok", "copilot", "qwen"]),
			makeRow("prompt", "run.model_enabled", false, { model: "copilot" }),
		];
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: PRO, // allowWebSearchApiTargets: false, pool: 20
			rows,
			level: "prompt",
			credentialsReady: (provider) => provider !== "unready-prov",
			assignablePoolUsage: PRO.claudePromptPool,
		});

		expect(runningIds(result)).toEqual(["x-runs"]);
		expect(reasonsFor(result, "x-disabled")).toEqual(["catalog-disabled"]);
		expect(reasonsFor(result, "x-unready")).toEqual(["credentials-unready"]);
		expect(reasonsFor(result, "x-entitle")).toEqual(["requires-entitlement"]);
		expect(reasonsFor(result, "x-menu")).toEqual(["not-in-plan-menu"]);
		expect(reasonsFor(result, "x-unpicked")).toEqual(["not-picked-by-brand"]);
		expect(reasonsFor(result, "x-prompt-off")).toEqual(["prompt-disabled"]);
		expect(reasonsFor(result, "x-pool")).toEqual(["pool-exhausted"]);

		const allReasons: ExclusionReason[] = [
			"catalog-disabled",
			"credentials-unready",
			"requires-entitlement",
			"not-in-plan-menu",
			"not-picked-by-brand",
			"prompt-disabled",
			"pool-exhausted",
		];
		expect(new Set(result.excluded.flatMap((e) => e.reasons))).toEqual(new Set(allReasons));
	});

	it("blocks custom targets without the allowCustomTargets entitlement", () => {
		const catalog = [makeTarget("acme-llm", "openrouter", { id: "x-custom", requiredEntitlement: "custom" })];
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: PRO,
			rows: [],
			level: "brand",
			credentialsReady: ready,
		});
		expect(reasonsFor(result, "x-custom")).toContain("requires-entitlement");
	});

	it("accumulates every applicable reason on one target", () => {
		const catalog = [makeTarget("chatgpt", "unready-prov", { id: "x-multi", enabled: false })];
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: PRO,
			rows: [makeRow("brand", "run.enabled_models", [])],
			level: "brand",
			credentialsReady: () => false,
		});
		expect(reasonsFor(result, "x-multi")).toEqual(["catalog-disabled", "credentials-unready", "not-picked-by-brand"]);
	});
});

// ---------------------------------------------------------------------------
// resolveEffectiveTargets — run-policy provenance details
// ---------------------------------------------------------------------------

describe("resolveEffectiveTargets — run policy provenance", () => {
	it("applies a target-selector cadence row to that target only", () => {
		const t1 = makeTarget("chatgpt", "brightdata", { id: "p-1" });
		const t2 = makeTarget("gemini", "olostep", { id: "p-2" });
		const targetRow = makeRow("instance", "run.cadence_hours", 2, { id: "r-target", targetId: "p-1" });
		const result = resolveEffectiveTargets({
			catalog: [t1, t2],
			entitlements: UNLIMITED_ENTITLEMENTS,
			rows: [targetRow],
			level: "brand",
			credentialsReady: ready,
		});
		const first = result.targets.find((t) => t.targetId === "p-1");
		const second = result.targets.find((t) => t.targetId === "p-2");
		expect(first?.runPolicy.cadenceHours).toBe(2);
		expect(first?.provenance.cadenceHours).toEqual({
			scope: "instance",
			rowId: "r-target",
			selector: { targetId: "p-1" },
		});
		expect(second?.runPolicy.cadenceHours).toBe(24);
		expect(second?.provenance.cadenceHours).toBe("default");
	});

	it("mixes row-sourced and default-sourced policy values with per-key provenance", () => {
		const catalog = [makeTarget("chatgpt", "brightdata", { id: "p-3" })];
		const brandCadence = makeRow("brand", "run.cadence_hours", 12, { id: "r-brand" });
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: UNLIMITED_ENTITLEMENTS,
			rows: [brandCadence],
			level: "brand",
			credentialsReady: ready,
		});
		const target = result.targets[0];
		expect(target.runPolicy).toEqual({ cadenceHours: 12, replication: 5 });
		expect(target.provenance.cadenceHours).toEqual({ scope: "brand", rowId: "r-brand" });
		expect(target.provenance.replication).toBe("default");
		expect(target.provenance.clamp).toBeUndefined();
	});
});
