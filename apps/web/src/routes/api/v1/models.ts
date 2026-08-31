/**
 * GET /api/v1/models — the models this deployment can track.
 *
 * Requires no scope. Lets a client build a model picker, and tells it which ids
 * the `model` filter accepts, without hardcoding names that differ between
 * deployments.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { modelCatalogue } from "@/server/models-core";

export const Route = createFileRoute("/api/v1/models")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				handle: async () => ({ data: modelCatalogue() }),
			}),
		}),
	},
});
