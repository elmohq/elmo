import { createHash } from "node:crypto";
import type { ResolvedCloudPlanEntitlements } from "@workspace/config/entitlements";
import type { resolveOrganizationEntitlements } from "./entitlements";

export const CLOUD_TRACKING_DISPATCH_QUEUE = "dispatch-tracking-v2";
export const CLOUD_TRACKING_TASK_QUEUE = "process-tracking-task-v2";
export const CLOUD_TRACKING_POLICY_SNAPSHOT_VERSION = 1;

type ResolvedEntitlements = Awaited<ReturnType<typeof resolveOrganizationEntitlements>>;
type AssignmentSource = "brand_selection" | "premium" | "custom";
export type TrackingUsageClass = "standard" | "premium" | "custom";

export interface RuntimeTrackingPolicy {
	usageClass: TrackingUsageClass;
	quotaKey: string;
	limitUnits: number;
}

export interface TrackingPolicySnapshot {
	version: typeof CLOUD_TRACKING_POLICY_SNAPSHOT_VERSION;
	organizationId: string;
	targetKey: string;
	provider: string;
	model: string;
	modelVersion?: string;
	webSearchEnabled: boolean;
	cadenceMinutes: number;
	samplesPerOccurrence: number;
	assignmentSource: AssignmentSource;
}

function dailyRuns(cadenceMinutes: number, samples: number): number {
	return Math.ceil(1440 / cadenceMinutes) * samples;
}

function standardDailyLimit(entitlements: ResolvedCloudPlanEntitlements): number {
	const perTarget = entitlements.trackingTargets.targets
		.map((target) => dailyRuns(target.schedule.cadenceMinutes, target.schedule.samplesPerEvaluation))
		.sort((a, b) => b - a)
		.slice(0, entitlements.trackingTargets.maximumSelected);
	return entitlements.promptSlots * perTarget.reduce((sum, value) => sum + value, 0);
}

/**
 * Revalidates an immutable occurrence against the organization's current
 * contract. Slower cadences and fewer samples remain valid; upgrades never
 * make already-materialized work more expensive than its snapshot.
 */
export function resolveRuntimeTrackingPolicy(input: {
	resolved: ResolvedEntitlements;
	assignmentSource: AssignmentSource;
	targetKey: string;
	cadenceMinutes: number;
	samplesPerOccurrence: number;
}): RuntimeTrackingPolicy | null {
	if (input.resolved.access !== "allowed" || input.resolved.mode !== "cloud") return null;
	const entitlements = input.resolved.entitlements;

	const target = entitlements.trackingTargets.targets.find((candidate) => candidate.targetKey === input.targetKey);
	if (input.assignmentSource === "brand_selection") {
		if (!target) return null;
		if (input.cadenceMinutes < target.schedule.cadenceMinutes) return null;
		if (input.samplesPerOccurrence > target.schedule.samplesPerEvaluation) return null;
		return {
			usageClass: "standard",
			quotaKey: "standard-daily-v1",
			limitUnits: standardDailyLimit(entitlements),
		};
	}

	if (input.assignmentSource === "premium") {
		const claude = entitlements.claudeTracking;
		if (
			input.targetKey !== "claude-native-web" ||
			!claude.enabled ||
			!claude.allowedModes.includes("native-web-search") ||
			!claude.schedule ||
			input.cadenceMinutes < claude.schedule.cadenceMinutes ||
			input.samplesPerOccurrence > claude.schedule.samplesPerEvaluation
		) {
			return null;
		}
		return {
			usageClass: "premium",
			quotaKey: "claude-native-web-daily-v1",
			limitUnits:
				claude.totalPromptSlots * dailyRuns(claude.schedule.cadenceMinutes, claude.schedule.samplesPerEvaluation),
		};
	}

	// Only contract-backed plans may create arbitrary custom assignments. A
	// custom assignment can point at either a configured standard target or the
	// contract's explicitly enabled Claude surface.
	if (input.resolved.source.kind !== "organization-override") return null;
	if (target) {
		if (input.cadenceMinutes < target.schedule.cadenceMinutes) return null;
		if (input.samplesPerOccurrence > target.schedule.samplesPerEvaluation) return null;
		return {
			usageClass: "custom",
			quotaKey: "custom-standard-daily-v1",
			limitUnits: standardDailyLimit(entitlements),
		};
	}

	const claude = entitlements.claudeTracking;
	if (
		input.targetKey !== "claude-native-web" ||
		!claude.enabled ||
		!claude.allowedModes.includes("native-web-search") ||
		!claude.schedule ||
		input.cadenceMinutes < claude.schedule.cadenceMinutes ||
		input.samplesPerOccurrence > claude.schedule.samplesPerEvaluation
	) {
		return null;
	}
	return {
		usageClass: "custom",
		quotaKey: "custom-claude-daily-v1",
		limitUnits: claude.totalPromptSlots * dailyRuns(claude.schedule.cadenceMinutes, claude.schedule.samplesPerEvaluation),
	};
}

export function utcDayWindow(now: Date): { periodStart: Date; periodEnd: Date } {
	const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
	return { periodStart, periodEnd };
}

export function nextFutureDueAt(dueAt: Date, cadenceMinutes: number, now: Date): Date {
	const cadenceMs = cadenceMinutes * 60_000;
	const elapsed = Math.max(0, now.getTime() - dueAt.getTime());
	const intervals = Math.floor(elapsed / cadenceMs) + 1;
	return new Date(dueAt.getTime() + intervals * cadenceMs);
}

/** A deterministic RFC 4122 UUID derived from a durable scheduling identity. */
export function stableTrackingId(namespace: "occurrence" | "task", ...parts: Array<string | number>): string {
	const bytes = createHash("sha256").update(["elmo-cloud-tracking-v2", namespace, ...parts].join("\u001f")).digest();
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.subarray(0, 16).toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isTrackingPolicySnapshot(value: unknown): value is TrackingPolicySnapshot {
	if (!value || typeof value !== "object") return false;
	const snapshot = value as Partial<TrackingPolicySnapshot>;
	return (
		snapshot.version === CLOUD_TRACKING_POLICY_SNAPSHOT_VERSION &&
		typeof snapshot.organizationId === "string" &&
		typeof snapshot.targetKey === "string" &&
		typeof snapshot.provider === "string" &&
		typeof snapshot.model === "string" &&
		(snapshot.modelVersion === undefined || typeof snapshot.modelVersion === "string") &&
		typeof snapshot.webSearchEnabled === "boolean" &&
		typeof snapshot.cadenceMinutes === "number" &&
		typeof snapshot.samplesPerOccurrence === "number" &&
		["brand_selection", "premium", "custom"].includes(snapshot.assignmentSource ?? "")
	);
}
