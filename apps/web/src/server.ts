import * as Sentry from "@sentry/tanstackstart-react";

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		sendDefaultPii: true,
		tracesSampleRate: 1.0,
		enableLogs: true,
		registerEsmLoaderHooks: false,
		integrations: [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
	});
}

// Import the server entry after Sentry init so auto-instrumentation can hook
// into package loading as early as possible in this runtime.
const { default: handler, createServerEntry } = await import("@tanstack/react-start/server-entry");

export default createServerEntry(
	Sentry.wrapFetchWithSentry({
		fetch(request: Request) {
			return handler.fetch(request);
		},
	}),
);
