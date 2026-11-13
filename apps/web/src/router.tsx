import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { NotFoundPage } from "./components/not-found-page";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { DefaultErrorComponent, DefaultPendingComponent } from "./router-default-components";
import { routeTree } from "./routeTree.gen";

// Raised by browsers and extensions rather than the app, and not actionable.
const BROWSER_NOISE = [
	"ResizeObserver loop limit exceeded",
	"ResizeObserver loop completed with undelivered notifications",
	/^Non-Error promise rejection captured with value: Object Not Found Matching Id/,
];

export const getRouter = () => {
	const rqContext = TanstackQuery.getContext();

	const router = createRouter({
		routeTree,
		// clientConfig and envValidation are provided by __root.tsx's beforeLoad
		context: rqContext,
		defaultPreload: "intent",
		defaultNotFoundComponent: NotFoundPage,
		defaultErrorComponent: DefaultErrorComponent,
		defaultPendingComponent: DefaultPendingComponent,
		defaultStaleTime: 30_000, // Cache loader data for 30s to avoid re-fetching on navigations
	});

	if (!router.isServer && import.meta.env.VITE_SENTRY_DSN) {
		Sentry.init({
			dsn: import.meta.env.VITE_SENTRY_DSN,
			environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
			initialScope: { tags: { service: "web" } },
			integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
			tracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 1,
			ignoreErrors: BROWSER_NOISE,
		});
	}

	setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient });

	return router;
};
