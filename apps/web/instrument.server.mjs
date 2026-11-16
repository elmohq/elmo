import * as Sentry from "@sentry/tanstackstart-react";

// Platform pings, health checks and the analytics proxy outnumber real requests and say nothing about the app.
const UNTRACED_PATHS = /^\/(_vercel\/|api\/health\/?$|api\/plausible\/)/;

function tracesSampleRate() {
	const rate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");
	return rate >= 0 && rate <= 1 ? rate : 1;
}

if (process.env.SENTRY_DSN) {
	const sampleRate = tracesSampleRate();

	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
		initialScope: { tags: { service: "web" } },
		integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
		tracesSampler: ({ attributes, inheritOrSampleWith }) => {
			const op = attributes?.["sentry.op"];
			const path = attributes?.["url.path"];
			if (op === "http.server" && typeof path === "string" && UNTRACED_PATHS.test(path)) return 0;
			// Without `node --import`, the first request a server instance handles has no request span,
			// so its trace would be named after whichever middleware ran first.
			if (op === "middleware") return 0;
			return inheritOrSampleWith(sampleRate);
		},
	});
}
