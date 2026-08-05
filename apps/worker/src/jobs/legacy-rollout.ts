export type SchedulerRolloutMode = "legacy" | "shadow" | "v2" | null;
export type SchedulerDeploymentMode = "local" | "demo" | "whitelabel" | "cloud";

/**
 * Missing rollout rows remain on the migration-safe legacy scheduler. Shadow
 * is also legacy-executed until a real shadow materializer exists. Only an
 * explicit v2 row transfers producer and consumer ownership to v2.
 */
export function shouldUseLegacyScheduler(mode: SchedulerDeploymentMode, rollout: SchedulerRolloutMode): boolean {
	return mode !== "cloud" || rollout !== "v2";
}
