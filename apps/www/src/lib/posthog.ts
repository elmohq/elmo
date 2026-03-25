import posthog from "posthog-js";

const POSTHOG_KEY = "phc_Jhx9LnI9cTDFHpQmpOzJSDTW127qD9pFU65KRnYym6z";
const POSTHOG_HOST = "https://var.elmohq.com";

let initialized = false;

export function initPostHog(): void {
	if (initialized || typeof window === "undefined") return;

	posthog.init(POSTHOG_KEY, {
		api_host: POSTHOG_HOST,
		capture_pageview: true,
		capture_pageleave: true,
		autocapture: false,
		disable_session_recording: true,
		persistence: "localStorage+cookie",
	});

	initialized = true;
}

export function trackEvent(
	eventName: string,
	properties?: Record<string, string | number | boolean | undefined>,
): void {
	if (!initialized) return;
	posthog.capture(eventName, properties);
}

export function identifyByEmail(email: string): void {
	if (!initialized) return;
	posthog.identify(email, { email });
}
