/**
 * What a brand is doing right now, in one word.
 *
 * Four independent fields decide it — `brands.enabled`, `brands.onboarded`, and
 * the org's `standing` and `trackingActive` — and every reader combined them
 * for itself: the sidebar branches on `onboarded`, the brand layout redirects on
 * `standing === "none"`, the overview page checks `onboarded` again, and the
 * billing page enumerates standings. Each is correct on its own and none of them
 * says what the combination means, so "is this brand being tracked?" had no
 * answer to point at.
 *
 * `SubscriptionStanding` is the same idea one level down, and the reason to
 * expect this to pay off: it replaced exactly this kind of per-call-site
 * reasoning about Stripe status strings with one word read everywhere.
 */

import type { Entitlements } from "@workspace/config/entitlements";

export type BrandTrackingState =
	/** Running: enabled, onboarded, and the org is entitled to run it. */
	| "tracked"
	/** Created but not through the wizard yet — it has no prompts to run. */
	| "onboarding"
	/** Turned off by someone in the org. Its history stays readable. */
	| "disabled"
	/** Billing stopped tracking (past_due beyond grace). History stays readable. */
	| "paused"
	/** No subscription. The dashboards are behind the paywall. */
	| "unentitled";

export interface BrandTrackingInputs {
	enabled: boolean;
	onboarded: boolean;
}

/**
 * Ordered by what overrides what, which is the part no single call site could
 * show. Billing outranks the brand's own switches: an unentitled org's brands
 * are all equally not running, and saying "disabled" about one of them would
 * send the reader to a toggle that would not help.
 */
export function brandTrackingState(brand: BrandTrackingInputs, entitlements: Entitlements): BrandTrackingState {
	if (entitlements.standing === "none") return "unentitled";
	if (!entitlements.trackingActive) return "paused";
	if (!brand.enabled) return "disabled";
	if (!brand.onboarded) return "onboarding";
	return "tracked";
}

/**
 * Whether the brand has anything to show. A paused or disabled brand keeps its
 * history — only new runs stop — so this is deliberately not "is it tracked".
 */
export function hasBrandData(state: BrandTrackingState): boolean {
	return state !== "unentitled" && state !== "onboarding";
}

/** Whether the reader should be sent to the paywall rather than shown the brand. */
export function needsPlan(state: BrandTrackingState): boolean {
	return state === "unentitled";
}
