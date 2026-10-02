import { onAnalyticsConsent } from "@workspace/ui/lib/cookie-consent";
import type { PostHog } from "posthog-js";

const POSTHOG_HOST = "https://var.elmohq.com";

// posthog-js is ~60KB gzipped and sets cookies, so it is imported dynamically
// and only once analytics consent is in effect. Anyone who declines never
// downloads it at all.
let instance: PostHog | null = null;
let loading: Promise<void> | null = null;
// The visitor's current answer. The import can resolve after they've changed
// their mind, so what happens then is decided by this, not by the call that
// started the load.
let allowed = false;

// Callers don't wait for that import, so anything they send in the meantime
// would be dropped. Identity is latched until analytics actually starts — a
// visitor who accepts after signing in still gets attributed. Events are only
// held while a load is in flight, since an action taken before consent should
// not be recorded once it arrives.
let identity: ((posthog: PostHog) => void) | null = null;
const queuedEvents: ((posthog: PostHog) => void)[] = [];

function send(call: (posthog: PostHog) => void): void {
	if (instance) call(instance);
	else if (loading && allowed) queuedEvents.push(call);
}

function load(apiKey: string): Promise<void> {
	loading ??= import("posthog-js").then(({ default: posthog }) => {
		posthog.init(apiKey, {
			api_host: POSTHOG_HOST,
			capture_pageview: true,
			capture_pageleave: true,
			autocapture: true,
			disable_session_recording: true,
			// Opting out then also deletes PostHog's cookie and localStorage
			// entries, rather than leaving the identifier behind.
			opt_out_persistence_by_default: true,
		});
		instance = posthog;
	});
	return loading;
}

function start(posthog: PostHog): void {
	// A returning visitor who opted out earlier is still opted out in PostHog's
	// own storage; anything replayed before this would be dropped.
	if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing({ captureEventName: false });
	posthog.register({ app_version: __APP_VERSION__ });
	identity?.(posthog);
	for (const call of queuedEvents.splice(0)) call(posthog);
}

function stop(posthog: PostHog): void {
	// Reset first: it clears the stored consent state along with the
	// identifier, so opting out afterwards is what sticks.
	posthog.reset(true);
	posthog.opt_out_capturing();
}

function sync(): void {
	if (!instance) return;
	if (allowed) start(instance);
	else stop(instance);
}

/**
 * Start analytics if the visitor's consent allows it, and keep following that
 * answer for the rest of the session. Returns an unsubscribe.
 */
export function initAnalytics(apiKey: string, consentRequired: boolean): () => void {
	return onAnalyticsConsent(consentRequired, (answer) => {
		allowed = answer;
		if (answer) {
			void load(apiKey).then(sync);
		} else {
			queuedEvents.length = 0;
			sync();
		}
	});
}

export function identifyUser(userId: string, properties?: Record<string, string | number | boolean | undefined>): void {
	identity = (posthog) => posthog.identify(userId, properties);
	if (instance && allowed) identity(instance);
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
	// reset() also clears a stored opt-out, which would restart capturing for a
	// visitor who declined.
	if (instance && allowed) instance.reset();
}
