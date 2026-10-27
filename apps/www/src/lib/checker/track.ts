import { trackEvent } from "@/lib/posthog";

type Props = Record<string, string | number | boolean>;

declare global {
	interface Window {
		plausible?: (event: string, options?: { props?: Props }) => void;
	}
}

const EVENTS = {
	started: { plausible: "AI Visibility Check Started", posthog: "ai_visibility_check_started" },
	completed: { plausible: "AI Visibility Check Completed", posthog: "ai_visibility_check_completed" },
	signup: { plausible: "AI Visibility Checker Signup", posthog: "ai_visibility_checker_signup" },
} as const;

/** Plausible counts the funnel without consent (it sets no cookies); PostHog gets it when consent allows. */
export function trackChecker(event: keyof typeof EVENTS, props: Props = {}): void {
	const names = EVENTS[event];
	window.plausible?.(names.plausible, { props });
	trackEvent(names.posthog, props);
}
