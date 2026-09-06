/**
 * Without this the file router hands an unmatched path to the SPA and a client
 * parsing JSON gets markup with a `200` on it. Nothing under /api/v1 ever
 * answers with HTML.
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
		// A wrong path is a 404 whatever verb asked for it, so there is no 405.
		handlers: withMethodGuard({
			GET: notFound,
			POST: notFound,
			PUT: notFound,
			PATCH: notFound,
			DELETE: notFound,
		}),
	},
});
