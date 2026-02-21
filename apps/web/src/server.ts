import * as Sentry from "@sentry/tanstackstart-react";

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		sendDefaultPii: true,
		tracesSampleRate: 1.0,
		enableLogs: true,
		registerEsmLoaderHooks: { onlyIncludeInstrumentedModules: true },
		integrations: [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
	});
}

const { default: handler, createServerEntry } = await import("@tanstack/react-start/server-entry");

export default createServerEntry(
	Sentry.wrapFetchWithSentry({
		fetch(request: Request) {
			return handler.fetch(request);
		},
	}),
);
