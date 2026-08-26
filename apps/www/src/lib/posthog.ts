import type { PostHog } from "posthog-js";
import { onAnalyticsConsent } from "@workspace/ui/lib/cookie-consent";

const POSTHOG_KEY = "phc_Jhx9LnI9cTDFHpQmpOzJSDTW127qD9pFU65KRnYym6z";
const POSTHOG_HOST = "https://var.elmohq.com";

// posthog-js is ~60KB gzipped and sets cookies, so it is imported dynamically
// and only once analytics consent is in effect. Visitors who decline never
// download it at all.
let instance: PostHog | null = null;
let loading: Promise<void> | null = null;

// Callers don't wait for that import, so anything they send in the meantime
// would be dropped. Identity is latched until analytics actually starts;
// events are only held while a load is in flight, since an action taken before
// consent should not be recorded once it arrives.
let identity: ((posthog: PostHog) => void) | null = null;
const queuedEvents: ((posthog: PostHog) => void)[] = [];

function load(): Promise<void> {
	loading ??= import("posthog-js").then(({ default: posthog }) => {
		posthog.init(POSTHOG_KEY, {
			api_host: POSTHOG_HOST,
			capture_pageview: true,
			capture_pageleave: true,
			autocapture: false,
			disable_session_recording: true,
			// Prevent PostHog from auto-loading optional feature scripts we don't use.
			// Without these, /static/{surveys,dead-clicks-autocapture,web-vitals}.js
			// were being fetched even though the server returns surveys:false etc.
			disable_surveys: true,
			capture_dead_clicks: false,
			capture_performance: false,
			persistence: "localStorage+cookie",
		});
		instance = posthog;
		identity?.(posthog);
		for (const call of queuedEvents.splice(0)) call(posthog);
	});
	return loading;
}

function stop(): void {
	if (!instance) return;
	instance.opt_out_capturing();
	// Drops the distinct id and stored properties, so withdrawing consent
	// clears the identifier rather than just pausing it.
	instance.reset(true);
}

/**
 * Start analytics if the visitor's consent allows it, and keep following that
 * answer for the rest of the session. Returns an unsubscribe.
 */
export function initAnalytics(consentRequired: boolean): () => void {
	return onAnalyticsConsent(consentRequired, (allowed) => {
		if (allowed) void load().then(() => instance?.opt_in_capturing());
		else stop();
	});
}

export function trackEvent(
	eventName: string,
	properties?: Record<string, string | number | boolean | undefined>,
): void {
	const call = (posthog: PostHog) => posthog.capture(eventName, properties);
	if (instance) call(instance);
	else if (loading) queuedEvents.push(call);
}

export function identifyByEmail(email: string): void {
	identity = (posthog) => posthog.identify(email, { email });
	if (instance) identity(instance);
}
