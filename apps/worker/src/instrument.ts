import * as Sentry from "@sentry/node";

// Sentry instruments `pg` and the other libraries as they load, so this has to
// be the first import in the entry point.
if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || "development",
		tracesSampleRate: 1.0,
	});
}
