/**
 * The models this deployment knows about.
 *
 * `configured` is what the operator has actually wired up; the rest of the
 * catalogue is still listed so a client can tell "we don't run this" from "this
 * isn't a model". An instance with nothing configured yet still gets the
 * catalogue rather than a failure.
 */
import { getModelMeta, KNOWN_MODELS } from "@workspace/config/models";
import { PREMIUM_MODELS } from "@workspace/config/plans";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";

export interface ModelSummary {
	id: string;
	label: string;
	premiumCapable: boolean;
	configured: boolean;
}

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
