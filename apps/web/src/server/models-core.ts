/** The whole catalogue is listed, not just what the operator wired up, so a
 * client can tell "we don't run this" from "this isn't a model". */
import { getModelMeta, KNOWN_MODELS } from "@workspace/config/models";
import { PREMIUM_MODELS } from "@workspace/config/plans";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import type * as z from "zod";
import type { modelSchema } from "@/lib/api/schemas/models";

export type ModelSummary = z.infer<typeof modelSchema>;

function configuredModels(): Set<string> {
	try {
		return new Set(parseScrapeTargets(process.env.SCRAPE_TARGETS).map((target) => target.model));
	} catch {
		return new Set();
	}
}

export function modelCatalogue(): ModelSummary[] {
	const configured = configuredModels();
	const premium = new Set(PREMIUM_MODELS);
	return Object.keys(KNOWN_MODELS).map((id) => ({
		id,
		label: getModelMeta(id).label,
		premiumCapable: premium.has(id),
		configured: configured.has(id),
	}));
}
