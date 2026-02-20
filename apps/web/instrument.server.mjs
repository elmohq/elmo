import * as Sentry from "@sentry/tanstackstart-react";

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		sendDefaultPii: true,
		tracesSampleRate: 1.0,
		enableLogs: true,
		integrations: [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
	});
}
