import * as Sentry from "@sentry/node";
import pkg from "../package.json";
import { JOB_SAMPLE_RATE_ATTRIBUTE, JOB_SPAN_OP, JOB_TRACE_RATE } from "./tracing";

// Scales the per-queue rates rather than replacing them, so lowering it keeps rare jobs better covered than schedules.
function rateMultiplier(): number {
	const rate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");
	return rate >= 0 && rate <= 1 ? rate : 1;
}

if (process.env.SENTRY_DSN) {
	const multiplier = rateMultiplier();

	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
		release: process.env.SENTRY_RELEASE || `elmo@${pkg.version}`,
		initialScope: { tags: { service: "worker" } },
		integrations: [
			Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
			Sentry.postgresIntegration({ ignoreConnectSpans: true }),
		],
		// Only jobs start traces. Anything else that runs outside one (pg-boss polling, telemetry
		// flushes, credential refreshes) would otherwise send a root span per outbound request.
		tracesSampler: ({ attributes }) => {
			if (attributes?.["sentry.op"] !== JOB_SPAN_OP) return 0;
			const jobRate = attributes[JOB_SAMPLE_RATE_ATTRIBUTE];
			return multiplier * (typeof jobRate === "number" ? jobRate : JOB_TRACE_RATE.routine);
		},
	});
}
