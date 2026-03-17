import posthog from "posthog-js";

const POSTHOG_HOST = "https://us.i.posthog.com";

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

export function identifyUser(
	userId: string,
	properties?: Record<string, string | number | boolean | undefined>,
): void {
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

export function setPersonProperties(
	properties: Record<string, string | number | boolean | undefined>,
): void {
	if (!initialized) return;
	posthog.people.set(properties);
}

export function resetPostHog(): void {
	if (!initialized) return;
	posthog.reset();
}
