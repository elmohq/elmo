import { definePlugin } from "nitro";
import * as Sentry from "@sentry/tanstackstart-react";

if (process.env.SENTRY_DSN && !Sentry.getClient()) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || "development",
		sendDefaultPii: true,
		tracesSampleRate: 1.0,
	});
}

export default definePlugin(() => {});
