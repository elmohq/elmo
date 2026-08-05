import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { brandAnalysisAdmissions, brands } from "../db/schema";
import { type OnboardingSuggestion, onboardingSuggestionSchema } from "../onboarding";
import { assertEnabledBrandCapacity, withOrganizationEntitlementTransaction } from "./capacity";

export const CLOUD_BRAND_ANALYSIS_JOB_VERSION = 2 as const;
export const CLOUD_BRAND_ANALYSIS_QUEUE = "analyze-brand-cloud-v2";
export const CLOUD_BRAND_ANALYSIS_MAX_ADMITTED_JOBS = 3;
export const CLOUD_BRAND_ANALYSIS_MAX_WEB_SEARCH_USES = 5;

// Queue payloads intentionally contain no customer-authored name, website, or
// prompt text. The provider-start fence resolves those inputs from the brand
// only after it consumes the current durable admission.
export const cloudBrandAnalysisJobDataSchema = z
	.object({
		version: z.literal(CLOUD_BRAND_ANALYSIS_JOB_VERSION),
		organizationId: z.string().min(1),
		brandId: z.string().min(1),
		admissionGeneration: z.number().int().positive().max(CLOUD_BRAND_ANALYSIS_MAX_ADMITTED_JOBS).safe(),
		requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();

export type CloudBrandAnalysisJobData = z.infer<typeof cloudBrandAnalysisJobDataSchema>;

export type CloudBrandAnalysisAdmissionDecision =
	| { kind: "reuse" }
	| { kind: "stale" }
	| { kind: "limit" }
	| { kind: "admit"; generation: number };

/** Pure admission policy shared by the coordinator and its behavior tests. */
export function decideCloudBrandAnalysisAdmission(
	current:
		| {
				status: "pending" | "running" | "completed" | "failed";
				requestFingerprint: string;
				generation: number;
		  }
		| undefined,
	requestFingerprint: string,
): CloudBrandAnalysisAdmissionDecision {
	if (current?.status === "pending" || current?.status === "running") {
		return current.requestFingerprint === requestFingerprint ? { kind: "reuse" } : { kind: "stale" };
	}
	if (current?.status === "completed" && current.requestFingerprint === requestFingerprint) {
		return { kind: "reuse" };
	}
	if ((current?.generation ?? 0) >= CLOUD_BRAND_ANALYSIS_MAX_ADMITTED_JOBS) {
		return { kind: "limit" };
	}
	return {
		kind: "admit",
		generation: (current?.generation ?? 0) + 1,
	};
}

export function cloudBrandAnalysisRequestFingerprint(input: {
	brandId: string;
	brandName: string;
	website: string;
}): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				version: CLOUD_BRAND_ANALYSIS_JOB_VERSION,
				brandId: input.brandId,
				brandName: input.brandName,
				website: input.website,
			}),
		)
		.digest("hex");
}

export function isCloudBrandAnalysisJobData(value: unknown): value is CloudBrandAnalysisJobData {
	return cloudBrandAnalysisJobDataSchema.safeParse(value).success;
}

/**
 * Identifies payloads that claim the metered cloud contract even when their
 * versioned schema is malformed. Workers use this to fail closed instead of
 * accidentally executing them through the unmetered legacy path.
 */
export function hasCloudBrandAnalysisJobMarker(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value as Record<string, unknown>;
	return (
		"version" in candidate ||
		"organizationId" in candidate ||
		"admissionGeneration" in candidate ||
		"requestFingerprint" in candidate
	);
}

/**
 * Atomically consumes the exact durable admission immediately before provider
 * I/O. Entitlements and authoritative brand inputs are rechecked under the
 * organization lock, and only one delivery can move pending -> running.
 */
export async function beginCloudBrandAnalysisProviderCall(input: {
	jobId: string;
	data: CloudBrandAnalysisJobData;
	now?: Date;
}): Promise<{ website: string; brandName: string } | null> {
	const now = input.now ?? new Date();
	return withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId: input.data.organizationId,
		run: async ({ tx, resolved }) => {
			const [brand] = await tx
				.select({ id: brands.id, name: brands.name, website: brands.website, enabled: brands.enabled })
				.from(brands)
				.where(and(eq(brands.id, input.data.brandId), eq(brands.organizationId, input.data.organizationId)))
				.limit(1)
				.for("update");
			if (!brand?.enabled) return null;
			await assertEnabledBrandCapacity({ tx, resolved, organizationId: input.data.organizationId });
			const requestFingerprint = cloudBrandAnalysisRequestFingerprint({
				brandId: brand.id,
				brandName: brand.name,
				website: brand.website,
			});
			if (requestFingerprint !== input.data.requestFingerprint) return null;

			const [started] = await tx
				.update(brandAnalysisAdmissions)
				.set({ status: "running", providerStartedAt: now, updatedAt: now })
				.where(
					and(
						eq(brandAnalysisAdmissions.brandId, input.data.brandId),
						eq(brandAnalysisAdmissions.organizationId, input.data.organizationId),
						eq(brandAnalysisAdmissions.jobId, input.jobId),
						eq(brandAnalysisAdmissions.generation, input.data.admissionGeneration),
						eq(brandAnalysisAdmissions.requestFingerprint, input.data.requestFingerprint),
						eq(brandAnalysisAdmissions.status, "pending"),
					),
				)
				.returning({ brandId: brandAnalysisAdmissions.brandId });
			return started ? { website: brand.website, brandName: brand.name } : null;
		},
	});
}

export async function completeCloudBrandAnalysisAdmission(input: {
	jobId: string;
	data: CloudBrandAnalysisJobData;
	result: OnboardingSuggestion;
	now?: Date;
}): Promise<boolean> {
	const result = onboardingSuggestionSchema.parse(input.result);
	const now = input.now ?? new Date();
	const [completed] = await db
		.update(brandAnalysisAdmissions)
		.set({
			status: "completed",
			result,
			lastError: null,
			completedAt: now,
			failedAt: null,
			updatedAt: now,
		})
		.where(
			and(
				eq(brandAnalysisAdmissions.brandId, input.data.brandId),
				eq(brandAnalysisAdmissions.organizationId, input.data.organizationId),
				eq(brandAnalysisAdmissions.jobId, input.jobId),
				eq(brandAnalysisAdmissions.generation, input.data.admissionGeneration),
				eq(brandAnalysisAdmissions.requestFingerprint, input.data.requestFingerprint),
				eq(brandAnalysisAdmissions.status, "running"),
			),
		)
		.returning({ brandId: brandAnalysisAdmissions.brandId });
	return completed !== undefined;
}

export async function failCloudBrandAnalysisAdmission(input: {
	jobId: string;
	data: CloudBrandAnalysisJobData;
	error: unknown;
	now?: Date;
}): Promise<boolean> {
	const now = input.now ?? new Date();
	const message = (input.error instanceof Error ? input.error.message : String(input.error)).slice(0, 10_000);
	const [failed] = await db
		.update(brandAnalysisAdmissions)
		.set({
			status: "failed",
			result: null,
			lastError: message || "Brand analysis failed",
			completedAt: null,
			failedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(brandAnalysisAdmissions.brandId, input.data.brandId),
				eq(brandAnalysisAdmissions.organizationId, input.data.organizationId),
				eq(brandAnalysisAdmissions.jobId, input.jobId),
				eq(brandAnalysisAdmissions.generation, input.data.admissionGeneration),
				eq(brandAnalysisAdmissions.requestFingerprint, input.data.requestFingerprint),
				eq(brandAnalysisAdmissions.status, "running"),
			),
		)
		.returning({ brandId: brandAnalysisAdmissions.brandId });
	return failed !== undefined;
}
