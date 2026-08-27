/**
 * GET /api/v1/platforms — the answer engines this deployment can track.
 *
 * Requires no scope. Lets a client build a platform picker, and tells it which
 * ids the `model` filter accepts, without hardcoding names that differ between
 * deployments.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getModelMeta, KNOWN_MODELS } from "@workspace/config/models";
import { PREMIUM_MODELS } from "@workspace/config/plans";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { createApiHandler } from "@/lib/api/handler";

function configuredModels(): string[] {
	try {
		return parseScrapeTargets(process.env.SCRAPE_TARGETS).map((target) => target.model);
	} catch {
		return [];
	}
}

export const Route = createFileRoute("/api/v1/platforms")({
	server: {
		handlers: {
			GET: createApiHandler({
				handle: async () => {
					// `configured` is what the operator has actually wired up; the rest
					// of the catalogue is still listed so a client can tell "we don't
					// run this" from "this isn't a platform". An instance with nothing
					// configured yet still gets the catalogue rather than a 500.
					const configured = new Set(configuredModels());
					const premium = new Set(PREMIUM_MODELS);
					return {
						data: Object.keys(KNOWN_MODELS).map((id) => ({
							id,
							label: getModelMeta(id).label,
							premiumCapable: premium.has(id),
							configured: configured.has(id),
						})),
					};
				},
			}),
		},
	},
});
