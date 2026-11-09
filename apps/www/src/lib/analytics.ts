import type { ReferralSource } from "@workspace/config/referrals";
import { trackEventBeforeNavigation } from "./posthog";

/** Where a call to action sends someone. */
export type CtaDestination = "cloud-signup" | "cloud-login" | "self-host" | "live-demo" | "book-demo" | "github";

declare global {
	interface Window {
		plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;
	}
}

/**
 * One click on a call to action, reported to both backends: Plausible for the
 * goal funnel, PostHog for the per-person journey that carries on in the app
 * under the same distinct id.
 */
export function trackCta(destination: CtaDestination, source: ReferralSource): void {
	if (typeof window === "undefined") return;
	const page = window.location.pathname;
	window.plausible?.("CTA Click", { props: { destination, source, page } });
	trackEventBeforeNavigation("cta_click", { destination, source, page });
}
