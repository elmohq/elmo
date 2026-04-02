import "../instrument.server.mjs";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

function getSentryConnectSrcOrigin(): string | undefined {
	const dsn = process.env.SENTRY_DSN;
	if (!dsn) return undefined;
	try {
		const url = new URL(dsn);
		return url.origin;
	} catch {
		return undefined;
	}
}

function buildSecurityHeaders(): Record<string, string> {
	const sentryOrigin = getSentryConnectSrcOrigin();

	const connectSrcParts = [
		"'self'",
		"https://var.elmohq.com",
		// Keep this explicit allow for clarity; the DSN origin (below) is the real source of truth.
		"https://*.ingest.sentry.io",
		"https://www.clarity.ms",
		...(sentryOrigin ? [sentryOrigin] : []),
	];

	return {
		"Content-Security-Policy": [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' https://www.clarity.ms",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: https:",
			"font-src 'self' data:",
			`connect-src ${connectSrcParts.join(" ")}`,
			"object-src 'none'",
			"frame-ancestors 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		].join("; "),
		"X-Frame-Options": "DENY",
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "strict-origin-when-cross-origin",
		"Permissions-Policy":
			"camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
	};
}

function addSecurityHeaders(response: Response): Response {
	const SECURITY_HEADERS = buildSecurityHeaders();
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
}

export default createServerEntry(
	wrapFetchWithSentry({
		async fetch(request: Request) {
			const response = await handler.fetch(request);
			return addSecurityHeaders(response);
		},
	}),
);
