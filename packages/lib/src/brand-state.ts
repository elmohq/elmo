import type { Entitlements } from "@workspace/config/entitlements";

export type BrandTrackingState = "tracked" | "onboarding" | "disabled" | "paused" | "unentitled";

export interface BrandTrackingInputs {
	enabled: boolean;
	onboarded: boolean;
}

// Billing outranks the brand's own switches: calling an unentitled brand "disabled"
// would point the reader at a toggle that cannot start tracking.
export function brandTrackingState(brand: BrandTrackingInputs, entitlements: Entitlements): BrandTrackingState {
	if (entitlements.standing === "none") return "unentitled";
	if (!entitlements.trackingActive) return "paused";
	if (!brand.enabled) return "disabled";
	if (!brand.onboarded) return "onboarding";
	return "tracked";
}

// Paused and disabled brands keep their history; only new runs stop.
export function hasBrandData(state: BrandTrackingState): boolean {
	return state !== "unentitled" && state !== "onboarding";
}

export function needsPlan(state: BrandTrackingState): boolean {
	return state === "unentitled";
}
