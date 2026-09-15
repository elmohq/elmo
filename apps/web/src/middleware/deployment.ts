/**
 * Where a deployment's own refusals happen, for every request the app serves.
 *
 * The decision itself is `evaluateDeploymentPolicy`, which is pure and tested
 * on its own. This is a request middleware rather than a function one so that
 * it covers route handlers and server functions alike — `/_serverFn/*` is a
 * path like any other, which is what makes this the single place a read-only
 * deployment refuses a write.
 *
 * It does not authenticate: resolving an API key needs a database, and
 * createApiHandler is the gate for `/api/v1`.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getDeployment } from "@workspace/deployment";
import { deploymentOpenApiSpec } from "@/lib/api/openapi";
import { evaluateDeploymentPolicy } from "@/lib/auth/policies";
export const deploymentMiddleware = createMiddleware().server(async ({ next }) => {
	const deployment = getDeployment();
	const request = getRequest();
	const url = new URL(request.url);

	const result = evaluateDeploymentPolicy(deployment.features, {
		pathname: url.pathname,
		method: request.method,
		authorizationHeader: request.headers.get("Authorization"),
	});

	switch (result.action) {
		case "block":
			throw new Response(
				JSON.stringify({
					error: result.error,
					message: result.message,
					// /api/v1 refusals carry the same machine code every route emits,
					// so a client has one shape to parse wherever the refusal came from.
					...(result.code ? { code: result.code } : {}),
				}),
				{ status: result.status, headers: { "Content-Type": "application/json" } },
			);
		case "redirect":
			throw Response.redirect(new URL(result.url, request.url), 302);
		case "serve-openapi":
			throw Response.json(deploymentOpenApiSpec(deployment.branding, url.origin), {
				headers: { "Content-Type": "application/json" },
			});
	}

	return next({
		context: {
			deploymentConfig: deployment,
		},
	});
});
