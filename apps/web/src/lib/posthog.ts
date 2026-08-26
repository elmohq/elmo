import type { PostHog } from "posthog-js";
import { onConsentChange, readConsent, resolveConsent } from "@workspace/ui/lib/cookie-consent";

const POSTHOG_HOST = "https://var.elmohq.com";

// posthog-js is ~60KB gzipped and sets cookies, so it is imported dynamically
// and only once analytics consent is in effect. Anyone who declines never
// downloads it at all.
let instance: PostHog | null = null;
let loading: Promise<void> | null = null;

// Callers don't wait for that import, so anything they send in the meantime
// would be dropped. Identity is latched until analytics actually starts — a
// visitor who accepts after signing in still gets attributed. Events are only
// held while a load is in flight, since an action taken before consent should
// not be recorded once it arrives.
let identity: ((posthog: PostHog) => void) | null = null;
const queuedEvents: ((posthog: PostHog) => void)[] = [];

function send(call: (posthog: PostHog) => void): void {
	if (instance) call(instance);
	else if (loading) queuedEvents.push(call);
}

function load(apiKey: string): Promise<void> {
	loading ??= import("posthog-js").then(({ default: posthog }) => {
		posthog.init(apiKey, {
			api_host: POSTHOG_HOST,
			capture_pageview: true,
			capture_pageleave: true,
			autocapture: true,
			disable_session_recording: true,
		});
		posthog.register({ app_version: __APP_VERSION__ });
		instance = posthog;
		identity?.(posthog);
		for (const call of queuedEvents.splice(0)) call(posthog);
	});
	return loading;
}

function stop(): void {
	if (!instance) return;
	instance.opt_out_capturing();
	// Drops the distinct id and stored properties, so withdrawing consent clears
	// the identifier rather than just pausing it.
	instance.reset(true);
}

/**
 * Start analytics if the visitor's consent allows it, and keep following that
 * answer for the rest of the session. Returns an unsubscribe.
 */
export function initAnalytics(apiKey: string, consentRequired: boolean): () => void {
	if (typeof window === "undefined") return () => {};

	const apply = (analytics: boolean) => {
		if (analytics) void load(apiKey).then(() => instance?.opt_in_capturing());
		else stop();
	};

	apply(resolveConsent(readConsent(), consentRequired).analytics);
	return onConsentChange((consent) => apply(consent.analytics));
}

export function identifyUser(userId: string, properties?: Record<string, string | number | boolean | undefined>): void {
	identity = (posthog) => posthog.identify(userId, properties);
	if (instance) identity(instance);
}

export function trackEvent(
	eventName: string,
	properties?: Record<string, string | number | boolean | undefined>,
): void {
	send((posthog) => posthog.capture(eventName, properties));
}

export function setPersonProperties(properties: Record<string, string | number | boolean | undefined>): void {
	send((posthog) => posthog.people.set(properties));
}

export function resetPostHog(): void {
	identity = null;
	instance?.reset();
}
