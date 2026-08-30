import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { NotFoundPage } from "./components/not-found-page";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { DefaultErrorComponent, DefaultPendingComponent } from "./router-default-components";
import { routeTree } from "./routeTree.gen";

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
		// A pending component replaces the whole page, chrome included, and once
		// shown it is pinned for `defaultPendingMinMs`. Wait long enough that a
		// 30ms navigation doesn't become a 200ms blank.
		defaultPendingMs: 250,
		defaultPendingMinMs: 200,
		defaultStaleTime: 30_000, // Cache loader data for 30s to avoid re-fetching on navigations
	});

	if (!router.isServer && import.meta.env.VITE_SENTRY_DSN) {
		Sentry.init({
			dsn: import.meta.env.VITE_SENTRY_DSN,
			environment: import.meta.env.MODE,
			sendDefaultPii: true,
			integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
			tracesSampleRate: 1.0,
		});
	}

	setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient });

	return router;
};
