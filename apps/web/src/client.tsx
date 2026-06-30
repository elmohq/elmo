import * as Sentry from "@sentry/tanstackstart-react";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

// Initialize Sentry here, in the client entry, before hydration — so telemetry
// emitted during module evaluation (e.g. a third-party lib that throws at import
// time) is captured. The router-aware browser-tracing integration needs the
// router instance, so it's attached separately in router.tsx via
// Sentry.addIntegration once the router exists. See issue #320.
//
// The hydration below mirrors TanStack Start's default client entry for our
// version; defining this file overrides that default.
if (import.meta.env.VITE_SENTRY_DSN) {
	Sentry.init({
		dsn: import.meta.env.VITE_SENTRY_DSN,
		environment: import.meta.env.MODE,
		sendDefaultPii: true,
		tracesSampleRate: 1.0,
	});
}

startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
	);
});
