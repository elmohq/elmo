/**
 * Request logging middleware for TanStack Start
 *
 * Logs every incoming request and its response status/duration.
 * Registered as global request middleware so it runs on every
 * server request (SSR, server routes, server functions).
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const loggerMiddleware = createMiddleware().server(async ({ next }) => {
	const request = getRequest();
	const startTime = Date.now();
	const timestamp = new Date().toISOString();
	const { method } = request;
	const url = new URL(request.url);
	const path = url.pathname + url.search;

	console.log(`[${timestamp}] --> ${method} ${path}`);

	try {
		const result = await next();
		const duration = Date.now() - startTime;

		console.log(`[${timestamp}] <-- ${method} ${path} (${duration}ms)`);

		return result;
	} catch (error) {
		const duration = Date.now() - startTime;

		// TanStack Start throws Response objects for redirects and error responses
		if (error instanceof Response) {
			console.log(
				`[${timestamp}] <-- ${method} ${path} ${error.status} (${duration}ms)`,
			);
		} else {
			console.error(
				`[${timestamp}] <-- ${method} ${path} ERROR (${duration}ms):`,
				error instanceof Error ? error.message : error,
			);
		}

		throw error;
	}
});
