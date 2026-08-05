import type { FeaturesConfig } from "@workspace/config/types";

type OpportunitiesFeatures = Pick<FeaturesConfig, "opportunities">;

export function isOpportunitiesAvailable(features: OpportunitiesFeatures | undefined): boolean {
	return features?.opportunities === true;
}

export function requireOpportunitiesAvailable(features: OpportunitiesFeatures | undefined): void {
	if (!isOpportunitiesAvailable(features)) {
		throw new Error("Opportunities are not available in this deployment");
	}
}
