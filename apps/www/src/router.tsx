import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { NotFound } from "./components/not-found";

export function getRouter() {
	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		defaultNotFoundComponent: NotFound,
		// Preload the matched route (component chunk + loader) on link hover so
		// navigating from the marketing pages into /docs doesn't feel like a
		// hard reload while the lazy fumadocs-ui bundle downloads.
		defaultPreload: "intent",
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
