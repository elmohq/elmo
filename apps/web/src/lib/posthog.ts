import posthog from "posthog-js";

const POSTHOG_HOST = "https://var.elmohq.com";

let initialized = false;

export function initPostHog(apiKey: string): void {
	if (initialized || typeof window === "undefined") return;

	posthog.init(apiKey, {
		api_host: POSTHOG_HOST,
		capture_pageview: true,
		capture_pageleave: true,
		autocapture: true,
		disable_session_recording: true,
	});

	posthog.register({ app_version: __APP_VERSION__ });
	initialized = true;
}

export function identifyUser(userId: string, properties?: Record<string, string | number | boolean | undefined>): void {
	if (!initialized) return;
	posthog.identify(userId, properties);
}

export function trackEvent(
	eventName: string,
	properties?: Record<string, string | number | boolean | undefined>,
): void {
	if (!initialized) return;
	posthog.capture(eventName, properties);
}

/**
 * For an event fired by a click that immediately leaves the page (a checkout
 * redirect, an OAuth hop): sent as a beacon at once, so the navigation cannot
 * cancel it.
 */
export function trackEventBeforeNavigation(
	eventName: string,
	properties?: Record<string, string | number | boolean | undefined>,
): void {
	if (!initialized) return;
	posthog.capture(eventName, properties, { send_instantly: true, transport: "sendBeacon" });
}

/**
 * Recording is off by default and switched on only for the pages where
 * someone is deciding whether to pay. It records nothing unless the PostHog
 * project has recordings enabled, and input values are masked by default.
 */
export function startSessionRecording(): void {
	if (!initialized) return;
	posthog.startSessionRecording();
}

export function stopSessionRecording(): void {
	if (!initialized) return;
	posthog.stopSessionRecording();
}

export function setPersonProperties(properties: Record<string, string | number | boolean | undefined>): void {
	if (!initialized) return;
	posthog.people.set(properties);
}

export function resetPostHog(): void {
	if (!initialized) return;
	posthog.reset();
}
