/**
 * Pure, DB-free helpers for the config UI (admin defaults, brand LLMs, prompt
 * models). Kept side-effect-free so they unit-test without the route/component
 * graph — and so the exclusion-reason copy (the B2 explainability keystone) and
 * the enabled-models checklist → write-payload mapping each have exactly one home.
 */
import type { ExclusionReason } from "@workspace/lib/config/resolve";

/** One entry for a `setConfigValues` call. `value` omitted/null = delete (revert to inherit). */
export interface ConfigEntry {
	key: string;
	selector?: { model?: string | null; targetId?: string | null };
	value?: unknown;
}

/**
 * Plain-language copy for every exclusion reason the resolver surfaces (B2):
 * `label` is the badge text, `description` the tooltip sentence explaining why a
 * target won't run and, where possible, how to fix it. The `Record` over the
 * full `ExclusionReason` union makes coverage a compile-time guarantee.
 */
export const EXCLUSION_REASON_COPY: Record<ExclusionReason, { label: string; description: string }> = {
	"catalog-disabled": {
		label: "Disabled",
		description: "This target is turned off in the instance catalog, so it never runs.",
	},
	"credentials-unready": {
		label: "No credentials",
		description: "The provider for this target has no working credentials. Add them on the Providers admin page.",
	},
	"requires-entitlement": {
		label: "Not on plan",
		description: "This target needs a plan entitlement your organization doesn't have.",
	},
	"not-in-plan-menu": {
		label: "Not on plan",
		description: "This model isn't part of your plan's model menu, so it can't be tracked.",
	},
	"not-picked-by-brand": {
		label: "Not tracked",
		description: "This model isn't selected for this brand.",
	},
	"prompt-disabled": {
		label: "Off for this prompt",
		description: "This model is turned off for this specific prompt.",
	},
	"pool-exhausted": {
		label: "Pool full",
		description: "Your plan's Claude prompt pool is fully used. Free a prompt to add another.",
	},
};

export function exclusionReasonLabel(reason: ExclusionReason): string {
	return EXCLUSION_REASON_COPY[reason]?.label ?? reason;
}

export function exclusionReasonDescription(reason: ExclusionReason): string {
	return EXCLUSION_REASON_COPY[reason]?.description ?? reason;
}

/**
 * Map a brand model-checklist selection to the `run.enabled_models` write.
 * `pickable` is the set of standard models the brand may track (the plan menu in
 * cloud, all standard catalog models otherwise). When every pickable model is
 * selected we DELETE the row (value omitted) so the brand reverts to the legacy
 * "track all" (null) state; otherwise we store the explicit subset ([] = none).
 */
export function enabledModelsEntries(selected: string[], pickable: string[]): ConfigEntry[] {
	const pickableSet = new Set(pickable);
	const inPickable = selected.filter((model) => pickableSet.has(model));
	if (isTrackingAll(inPickable, pickable)) return [{ key: "run.enabled_models" }];
	return [{ key: "run.enabled_models", value: inPickable }];
}

/** True when the selection is the "tracking all models (default)" state (every pickable model chosen). */
export function isTrackingAll(selected: string[], pickable: string[]): boolean {
	if (pickable.length === 0) return false;
	const selectedSet = new Set(selected);
	return pickable.every((model) => selectedSet.has(model));
}

// --- cadence composition (week / day / hour) — pure halves of the defaults form ---

export interface TimeParts {
	weeks: number;
	days: number;
	hours: number;
}

export function hoursToParts(hours: number): TimeParts {
	const whole = Math.max(0, Math.round(hours));
	return {
		weeks: Math.floor(whole / (7 * 24)),
		days: Math.floor((whole % (7 * 24)) / 24),
		hours: whole % 24,
	};
}

export function partsToHours(parts: TimeParts): number {
	return parts.weeks * 7 * 24 + parts.days * 24 + parts.hours;
}

/** Compact cadence label: "6h", "1d", "1w 2d". Fractional hours round for display. */
export function formatCadence(hours: number): string {
	const { weeks, days, hours: remaining } = hoursToParts(hours);
	const parts: string[] = [];
	if (weeks > 0) parts.push(`${weeks}w`);
	if (days > 0) parts.push(`${days}d`);
	if (remaining > 0) parts.push(`${remaining}h`);
	return parts.length > 0 ? parts.join(" ") : "0h";
}

/** Post-save impact summary (B6): "Tracking 4 models · runs every 6h". */
export function impactSummary(input: { modelCount: number; cadenceHours: number }): string {
	const models = `Tracking ${input.modelCount} model${input.modelCount === 1 ? "" : "s"}`;
	return `${models} · runs every ${formatCadence(input.cadenceHours)}`;
}
