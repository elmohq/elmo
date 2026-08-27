/**
 * Anything under /api/v1 that matches no route.
 *
 * Without this the file router hands an unmatched path to the SPA, and a client
 * parsing JSON gets a page of markup with a `200` on it. The invariant worth
 * stating plainly: **nothing under /api/v1 ever answers with HTML** — not a
 * wrong path, not a wrong verb, not a refusal from the deployment middleware.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";

const notFound = createApiHandler({
	handle: async ({ request }) => {
		throw new ApiError(404, "Not Found", `No API endpoint at ${new URL(request.url).pathname}`);
	},
});

export const Route = createFileRoute("/api/v1/$")({
	server: {
		// A wrong path is a 404 whatever verb asked for it, so the guard has
		// nothing left to fill in with a 405.
		handlers: withMethodGuard({
			GET: notFound,
			POST: notFound,
			PUT: notFound,
			PATCH: notFound,
			DELETE: notFound,
		}),
	},
});
