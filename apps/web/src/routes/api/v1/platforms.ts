/**
 * GET /api/v1/platforms — the answer engines this deployment can track.
 *
 * Requires no scope. Lets a client build a platform picker, and tells it which
 * ids the `model` filter accepts, without hardcoding names that differ between
 * deployments.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { platformCatalogue } from "@/server/platforms-core";

export const Route = createFileRoute("/api/v1/platforms")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				handle: async () => ({ data: platformCatalogue() }),
			}),
		}),
	},
});
