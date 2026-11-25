import * as Sentry from "@sentry/tanstackstart-react";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Server function URLs are build hashes, so without this every call shares one
 * transaction name and per-function latency and failure rates can't be told apart.
 * Functions called in-process while rendering a page leave that page's name alone.
 */
export function nameServerFnTransaction(functionName: string | undefined): void {
	const request = getRequest();
	if (!functionName || !new URL(request.url).pathname.includes("/_serverFn/")) return;

	const activeSpan = Sentry.getActiveSpan();
	const rootSpan = activeSpan && Sentry.getRootSpan(activeSpan);
	if (rootSpan && Sentry.spanToJSON(rootSpan).attributes?.["sentry.op"] === "http.server") {
		const name = `${request.method} /_serverFn/${functionName}`;
		Sentry.updateSpanName(rootSpan, name);
		rootSpan.setAttribute("sentry.segment.name.source", "route");
		Sentry.getCurrentScope().setTransactionName(name);
	}
}
