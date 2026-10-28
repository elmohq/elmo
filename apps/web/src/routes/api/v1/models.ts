/** Requires no scope: which ids the `model` filter accepts differs between
 * deployments, so a client cannot hardcode them. */
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
