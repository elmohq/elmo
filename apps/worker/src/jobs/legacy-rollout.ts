export type SchedulerRolloutMode = "legacy" | "shadow" | "v2" | "paused" | null;
export type SchedulerDeploymentMode = "local" | "demo" | "whitelabel" | "cloud";

/**
 * Missing rollout rows remain on the migration-safe legacy scheduler. Shadow
 * is also legacy-executed until a real shadow materializer exists. Only an
 * explicit v2 row transfers producer and consumer ownership to v2. Paused is
 * the fail-closed rollback state: neither scheduler may produce work.
 */
export function shouldUseLegacyScheduler(mode: SchedulerDeploymentMode, rollout: SchedulerRolloutMode): boolean {
	return mode !== "cloud" || (rollout !== "v2" && rollout !== "paused");
}
