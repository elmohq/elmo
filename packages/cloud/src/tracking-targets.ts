import {
	CLAUDE_BASE_MODEL_TARGET_KEY,
	CLAUDE_NATIVE_WEB_TARGET_KEY,
	CLOUD_PLAN_CATALOG,
	STANDARD_TRACKING_TARGETS,
} from "@workspace/config/plans";
import { getTrackingTargetKey, type ModelConfig } from "@workspace/config/scrape-targets";

export { CLAUDE_BASE_MODEL_TARGET_KEY, CLAUDE_NATIVE_WEB_TARGET_KEY };

/**
 * Cloud sells logical answer surfaces, while SCRAPE_TARGETS chooses how each
 * surface is executed. Pin that mapping at boot so billing, schedules, and
 * provider calls cannot silently refer to different things.
 */
export function validateCloudTrackingTargets(configs: readonly ModelConfig[]): void {
	const byKey = new Map<string, ModelConfig>();
	for (const config of configs) {
		const key = getTrackingTargetKey(config);
		if (byKey.has(key)) {
			throw new Error(`SCRAPE_TARGETS: cloud target key "${key}" must be unique`);
		}
		byKey.set(key, config);
	}

	// This guards catalog drift even if a plan entry is accidentally narrowed.
	for (const key of STANDARD_TRACKING_TARGETS) {
		if (!byKey.has(key)) throw new Error(`SCRAPE_TARGETS: standard cloud target "${key}" is not configured`);
	}

	const publicTargetKeys = new Set(
		Object.values(CLOUD_PLAN_CATALOG).flatMap((plan) =>
			plan.entitlements.kind === "catalog"
				? plan.entitlements.value.trackingTargets.targets.map((target) => target.targetKey)
				: [],
		),
	);
	for (const key of publicTargetKeys) {
		if (!byKey.has(key)) throw new Error(`SCRAPE_TARGETS: cloud catalog target "${key}" is not configured`);
	}

	const claudeBase = byKey.get(CLAUDE_BASE_MODEL_TARGET_KEY);
	if (!claudeBase) {
		throw new Error(`SCRAPE_TARGETS: cloud premium target "${CLAUDE_BASE_MODEL_TARGET_KEY}" is not configured`);
	}
	if (claudeBase.model !== "claude" || claudeBase.provider !== "anthropic-api" || claudeBase.webSearch) {
		throw new Error(
			`SCRAPE_TARGETS: "${CLAUDE_BASE_MODEL_TARGET_KEY}" must use claude:anthropic-api without web search`,
		);
	}

	const claudeNativeWeb = byKey.get(CLAUDE_NATIVE_WEB_TARGET_KEY);
	if (!claudeNativeWeb) {
		throw new Error(`SCRAPE_TARGETS: cloud premium target "${CLAUDE_NATIVE_WEB_TARGET_KEY}" is not configured`);
	}
	if (
		claudeNativeWeb.model !== "claude" ||
		claudeNativeWeb.provider !== "anthropic-api" ||
		!claudeNativeWeb.webSearch
	) {
		throw new Error(
			`SCRAPE_TARGETS: "${CLAUDE_NATIVE_WEB_TARGET_KEY}" must use claude:anthropic-api with native web search`,
		);
	}
}
