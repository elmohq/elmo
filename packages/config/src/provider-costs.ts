import { z } from "zod";
import { getTrackingTargetKey, type ModelConfig } from "./scrape-targets";

const targetKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be a stable tracking target key");
const costMicrousdSchema = z
	.number()
	.int("must be an integer number of microusd")
	.nonnegative("must be nonnegative")
	.max(Number.MAX_SAFE_INTEGER, "must be a safe integer");
const providerCostEstimatesSchema = z.record(targetKeySchema, costMicrousdSchema);

export type ProviderCostEstimates = Readonly<Record<string, number>>;

export function parseProviderCostEstimates(value: string | undefined): ProviderCostEstimates {
	if (!value?.trim()) {
		throw new Error(
			"CLOUD_TRACKING_COST_ESTIMATES is required in cloud and must be a JSON object of target-key to estimated microusd per provider call",
		);
	}

	let decoded: unknown;
	try {
		decoded = JSON.parse(value);
	} catch (error) {
		throw new Error("CLOUD_TRACKING_COST_ESTIMATES must be valid JSON", { cause: error });
	}

	const parsed = providerCostEstimatesSchema.safeParse(decoded);
	if (!parsed.success) {
		throw new Error(`CLOUD_TRACKING_COST_ESTIMATES is invalid: ${z.prettifyError(parsed.error)}`);
	}
	return Object.freeze({ ...parsed.data });
}

/**
 * Price estimates are an operator input because upstream prices change. Exact
 * coverage prevents a target from silently running without billing-grade cost
 * attribution, and rejects stale keys so configuration changes are deliberate.
 */
export function validateProviderCostEstimateCoverage(
	estimates: ProviderCostEstimates,
	targets: readonly ModelConfig[],
): void {
	const targetKeys = targets.map(getTrackingTargetKey);
	const duplicateTargetKeys = [...new Set(targetKeys.filter((key, index) => targetKeys.indexOf(key) !== index))].sort();
	if (duplicateTargetKeys.length > 0) {
		throw new Error(`SCRAPE_TARGETS contains duplicate target keys: ${duplicateTargetKeys.join(", ")}`);
	}

	const expected = new Set(targetKeys);
	const configured = Object.keys(estimates);
	const missing = targetKeys.filter((key) => !Object.hasOwn(estimates, key)).sort();
	const extra = configured.filter((key) => !expected.has(key)).sort();
	if (missing.length === 0 && extra.length === 0) return;

	const problems = [
		...(missing.length > 0 ? [`missing estimates for ${missing.join(", ")}`] : []),
		...(extra.length > 0 ? [`unknown estimates for ${extra.join(", ")}`] : []),
	];
	throw new Error(`CLOUD_TRACKING_COST_ESTIMATES must exactly cover SCRAPE_TARGETS: ${problems.join("; ")}`);
}

export function getProviderCostEstimate(estimates: ProviderCostEstimates, targetKey: string): number {
	if (!Object.hasOwn(estimates, targetKey)) {
		throw new Error(`No cloud provider cost estimate is configured for target "${targetKey}"`);
	}
	const estimate = estimates[targetKey];
	if (typeof estimate !== "number") throw new Error(`Invalid cloud provider cost estimate for target "${targetKey}"`);
	return estimate;
}
