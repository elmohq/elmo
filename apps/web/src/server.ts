import "../instrument.server.mjs";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { createCloudBillingReadinessGate } from "@workspace/cloud/billing-readiness";
import { WebRuntimeDrainingError } from "@/lib/deployment-runtime.server";
import { initializeWebDeploymentRuntime } from "@/lib/deployment-runtime-bootstrap.server";

const { lifecycle: webDeploymentRuntime, participant: runtimeFenceParticipant } = initializeWebDeploymentRuntime();
await runtimeFenceParticipant;

const assertCloudBillingReady = createCloudBillingReadinessGate({
	mode: process.env.DEPLOYMENT_MODE,
	validate: async () => {
		const { requireCloudBillingRuntime } = await import("@/lib/auth/server");
		await requireCloudBillingRuntime().validateStartup();
	},
});

// HSTS asserts HTTPS-only for the host that served the response. Whitelabel
// deployments run on customer-controlled custom domains, where `includeSubDomains`
// would wrongly assert HTTPS across subdomains we don't own — so that directive
// is scoped to our own deployments. Browsers ignore HSTS received over plain
// HTTP, so it stays inert on localhost.
const strictTransportSecurity =
	process.env.DEPLOYMENT_MODE === "whitelabel" ? "max-age=63072000" : "max-age=63072000; includeSubDomains";

const SECURITY_HEADERS: Record<string, string> = {
	"Content-Security-Policy": [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' https://*.clarity.ms https://var.elmohq.com",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https: https://c.bing.com",
		"font-src 'self' data:",
		"connect-src 'self' https://var.elmohq.com https://*.sentry.io https://*.clarity.ms https://c.bing.com",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; "),
	"Strict-Transport-Security": strictTransportSecurity,
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	// same-origin-allow-popups (not same-origin) keeps OAuth/SSO popups that rely on
	// window.opener working while still isolating us from cross-origin openers.
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
};

function addSecurityHeaders(response: Response): Response {
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
}

export default createServerEntry(
	wrapFetchWithSentry({
		async fetch(request: Request) {
			try {
				return await webDeploymentRuntime.runRequest(async () => {
					// A bad Stripe catalog would make checkout or add-on mutations
					// non-deterministic, so cloud stays closed until the exact lookup-key
					// catalog has passed validation. The promise is shared across requests.
					await assertCloudBillingReady();
					const response = await handler.fetch(request);
					return addSecurityHeaders(response);
				});
			} catch (error) {
				if (!(error instanceof WebRuntimeDrainingError)) throw error;
				return addSecurityHeaders(
					new Response("Server is shutting down", {
						headers: { Connection: "close", "Retry-After": "5" },
						status: 503,
					}),
				);
			}
		},
	}),
);
