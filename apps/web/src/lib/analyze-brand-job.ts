/**
 * Server-only helpers for the async brand-analysis job.
 *
 * All pg-boss coupling for the onboarding analysis lives here so the server
 * functions in `@/server/onboarding` stay thin. Cloud admissions are owned by
 * the brand's organization and persisted independently of pg-boss retention;
 * noncloud deployments retain their legacy queue behavior.
 *
 * Reading the result goes straight at pg-boss's `pgboss.job` table rather than
 * `getJobById`, because the client polls by brand (not by an opaque job id it
 * has to round-trip). The columns used here (`name`, `data`, `state`,
 * `output`, `created_on`) are stable across the pinned pg-boss v12 line.
 */
import { randomUUID } from "node:crypto";
import { lockOrganizationCapacity } from "@workspace/lib/cloud/advisory-locks";
import {
	CLOUD_BRAND_ANALYSIS_MAX_ADMITTED_JOBS,
	CLOUD_BRAND_ANALYSIS_QUEUE,
	type CloudBrandAnalysisJobData,
	cloudBrandAnalysisRequestFingerprint,
	decideCloudBrandAnalysisAdmission,
} from "@workspace/lib/cloud/brand-analysis-admission";
import { assertEnabledBrandCapacity, withOrganizationEntitlementTransaction } from "@workspace/lib/cloud/capacity";
import { db } from "@workspace/lib/db/db";
import { brandAnalysisAdmissions, brands } from "@workspace/lib/db/schema";
import { type OnboardingSuggestion, onboardingSuggestionSchema } from "@workspace/lib/onboarding";
import { and, eq, sql } from "drizzle-orm";
import { fromDrizzle } from "pg-boss";
import { getBoss } from "@/lib/boss-client";
import { extractDomain } from "@/lib/domain-categories";

const LEGACY_ANALYZE_BRAND_QUEUE = "analyze-brand";

/**
 * Shown to the user when a job ends in a failed/cancelled state. The real
 * error (provider messages, stack traces) is already captured server-side by
 * the worker's Sentry wrapper; we never forward it to the browser.
 */
const GENERIC_FAILURE = "Brand analysis failed. Please try again.";

/** Discriminated status returned to the wizard while it polls. */
export type AnalyzeBrandStatus =
	| { status: "pending" }
	| { status: "done"; suggestion: OnboardingSuggestion }
	| { status: "failed"; error: string };

export interface AnalyzeBrandInput {
	/** Must be access-checked by the caller. */
	brandId: string;
	website: string;
	brandName?: string;
}

interface JobRow {
	id: string;
	state: string;
	data: { website?: string } | null;
	output: unknown;
}

interface CloudJobRow {
	state: string;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CloudAdmissionRow = typeof brandAnalysisAdmissions.$inferSelect;

/** The most recent analyze-brand job for a brand, regardless of state. */
async function latestJobForBrand(brandId: string): Promise<JobRow | undefined> {
	const result = await db.execute(sql`
		SELECT id, state, data, output
		FROM pgboss.job
		WHERE name = ${LEGACY_ANALYZE_BRAND_QUEUE} AND data->>'brandId' = ${brandId}
		ORDER BY created_on DESC
		LIMIT 1
	`);
	return result.rows[0] as unknown as JobRow | undefined;
}

const IN_FLIGHT_STATES = new Set(["created", "active", "retry"]);

/**
 * Enqueue a brand analysis, deduped by the brand + domain it runs for.
 *
 * If an analysis for this domain is already in flight we reuse it instead of
 * paying for a second run; once a job reaches a terminal state a fresh analysis
 * is allowed again (so "try again" works).
 *
 * We guard with an explicit in-flight check rather than pg-boss's `singletonKey`
 * because that would be a no-op here: `singleton_key` only enforces uniqueness
 * under a non-standard queue policy (short/singleton/stately) or with a
 * `singletonSeconds` window, and this queue uses the default `standard` policy
 * with no window. The check-then-send isn't atomic, but the analyze button is a
 * deliberate, low-frequency action (and disabled while running), so the worst
 * case — two near-simultaneous clicks racing past the check — is rare and
 * merely costs a duplicate run.
 */
export async function enqueueAnalyzeBrand(input: AnalyzeBrandInput): Promise<void> {
	const boss = await getBoss();
	const domain = extractDomain(input.website);

	const latest = await latestJobForBrand(input.brandId);
	if (latest && IN_FLIGHT_STATES.has(latest.state) && extractDomain(latest.data?.website ?? "") === domain) {
		return;
	}

	await boss.send(LEGACY_ANALYZE_BRAND_QUEUE, input);
}

/** Poll the status/result of the latest brand-analysis job for a brand. */
export async function getAnalyzeBrandStatus(brandId: string): Promise<AnalyzeBrandStatus> {
	const job = await latestJobForBrand(brandId);

	// No job yet — the enqueue may not be visible, or the worker hasn't picked
	// it up. Either way the client should keep polling.
	if (!job) {
		return { status: "pending" };
	}
	if (job.state === "completed") {
		const suggestion = onboardingSuggestionSchema.safeParse(job.output);
		if (suggestion.success) return { status: "done", suggestion: suggestion.data };
		console.error("[analyze-brand] completed job contains an invalid result", { brandId, jobId: job.id });
		return { status: "failed", error: GENERIC_FAILURE };
	}
	if (job.state === "failed" || job.state === "cancelled") {
		console.error("[analyze-brand] job ended without a result", {
			brandId,
			jobId: job.id,
			state: job.state,
		});
		return { status: "failed", error: GENERIC_FAILURE };
	}
	return { status: "pending" };
}

/**
 * Best-effort cancel of an in-flight analysis for a brand. Used when the user
 * backs out of the wizard so the worker doesn't keep grinding on a result
 * nobody is waiting for.
 */
export async function cancelAnalyzeBrand(brandId: string): Promise<void> {
	const job = await latestJobForBrand(brandId);
	if (!job || !IN_FLIGHT_STATES.has(job.state)) {
		return;
	}
	const boss = await getBoss();
	try {
		await boss.cancel(LEGACY_ANALYZE_BRAND_QUEUE, job.id);
	} catch {
		// Job may have completed between the read and the cancel — nothing to do.
	}
}

export class CloudBrandAnalysisLimitError extends Error {
	constructor() {
		super(`This brand has used its ${CLOUD_BRAND_ANALYSIS_MAX_ADMITTED_JOBS} included analysis runs.`);
		this.name = "CloudBrandAnalysisLimitError";
	}
}

async function assertCloudBrandOrganization(
	tx: DbTransaction,
	organizationId: string,
	brandId: string,
): Promise<{ id: string; name: string; website: string }> {
	const [brand] = await tx
		.select({ id: brands.id, name: brands.name, website: brands.website, enabled: brands.enabled })
		.from(brands)
		.where(and(eq(brands.id, brandId), eq(brands.organizationId, organizationId)))
		.limit(1)
		.for("update");
	if (!brand) throw new Error("Brand does not belong to this organization");
	if (!brand.enabled) throw new Error("Disabled brands cannot start or access cloud analysis");
	return brand;
}

async function loadCloudAdmissionForUpdate(
	tx: DbTransaction,
	organizationId: string,
	brandId: string,
): Promise<CloudAdmissionRow | undefined> {
	const [admission] = await tx
		.select()
		.from(brandAnalysisAdmissions)
		.where(
			and(eq(brandAnalysisAdmissions.organizationId, organizationId), eq(brandAnalysisAdmissions.brandId, brandId)),
		)
		.limit(1)
		.for("update");
	return admission;
}

async function pgBossJob(tx: DbTransaction, jobId: string): Promise<CloudJobRow | undefined> {
	const result = await tx.execute(sql`
		SELECT state
		FROM pgboss.job
		WHERE name = ${CLOUD_BRAND_ANALYSIS_QUEUE} AND id = ${jobId}::uuid
		LIMIT 1
	`);
	return result.rows[0] as unknown as CloudJobRow | undefined;
}

async function failCloudAdmission(
	tx: DbTransaction,
	admission: CloudAdmissionRow,
	message: string,
	now: Date,
): Promise<CloudAdmissionRow> {
	const lastError = message.slice(0, 10_000) || "Brand analysis failed";
	await tx
		.update(brandAnalysisAdmissions)
		.set({
			status: "failed",
			result: null,
			lastError,
			completedAt: null,
			failedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(brandAnalysisAdmissions.brandId, admission.brandId),
				eq(brandAnalysisAdmissions.organizationId, admission.organizationId),
				eq(brandAnalysisAdmissions.jobId, admission.jobId),
				eq(brandAnalysisAdmissions.generation, admission.generation),
			),
		);
	return {
		...admission,
		status: "failed",
		result: null,
		lastError,
		completedAt: null,
		failedAt: now,
		updatedAt: now,
	};
}

async function repairCloudAdmission(
	tx: DbTransaction,
	admission: CloudAdmissionRow,
	now: Date,
): Promise<CloudAdmissionRow> {
	if (admission.status === "completed") {
		if (onboardingSuggestionSchema.safeParse(admission.result).success) return admission;
		return failCloudAdmission(tx, admission, "Stored result failed durable schema validation", now);
	}
	if (admission.status === "failed") return admission;
	const job = await pgBossJob(tx, admission.jobId);
	if (job && IN_FLIGHT_STATES.has(job.state)) return admission;

	return failCloudAdmission(
		tx,
		admission,
		job ? `pg-boss job became ${job.state} without a valid durable result` : "pg-boss job is no longer retained",
		now,
	);
}

export async function enqueueCloudAnalyzeBrand(input: { organizationId: string; brandId: string }): Promise<void> {
	const boss = await getBoss();
	await withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			const brand = await assertCloudBrandOrganization(tx, input.organizationId, input.brandId);
			await assertEnabledBrandCapacity({ tx, resolved, organizationId: input.organizationId });
			const requestFingerprint = cloudBrandAnalysisRequestFingerprint({
				brandId: brand.id,
				brandName: brand.name,
				website: brand.website,
			});
			const stored = await loadCloudAdmissionForUpdate(tx, input.organizationId, input.brandId);
			const current = stored ? await repairCloudAdmission(tx, stored, new Date()) : undefined;
			let decision = decideCloudBrandAnalysisAdmission(current, requestFingerprint);
			if (decision.kind === "stale" && current) {
				const invalidated = await failCloudAdmission(
					tx,
					current,
					"Authoritative brand details changed during analysis",
					new Date(),
				);
				decision = decideCloudBrandAnalysisAdmission(invalidated, requestFingerprint);
			}
			if (decision.kind === "reuse") return;
			if (decision.kind === "limit") throw new CloudBrandAnalysisLimitError();
			if (decision.kind === "stale") throw new Error("Failed to invalidate stale brand analysis");

			const now = new Date();
			const jobId = randomUUID();
			const { generation } = decision;
			const data: CloudBrandAnalysisJobData = {
				version: 1,
				organizationId: input.organizationId,
				brandId: input.brandId,
				admissionGeneration: generation,
				requestFingerprint,
				website: brand.website,
				brandName: brand.name,
			};

			if (current) {
				await tx
					.update(brandAnalysisAdmissions)
					.set({
						requestFingerprint,
						jobId,
						generation,
						status: "pending",
						result: null,
						lastError: null,
						providerStartedAt: null,
						completedAt: null,
						failedAt: null,
						updatedAt: now,
					})
					.where(
						and(
							eq(brandAnalysisAdmissions.brandId, input.brandId),
							eq(brandAnalysisAdmissions.organizationId, input.organizationId),
						),
					);
			} else {
				await tx.insert(brandAnalysisAdmissions).values({
					brandId: input.brandId,
					organizationId: input.organizationId,
					requestFingerprint,
					jobId,
					generation,
					status: "pending",
					createdAt: now,
					updatedAt: now,
				});
			}

			const sentJobId = await boss.send(CLOUD_BRAND_ANALYSIS_QUEUE, data, {
				id: jobId,
				retryLimit: 0,
				db: fromDrizzle(tx, sql),
			});
			if (sentJobId !== jobId) throw new Error("Failed to enqueue the admitted brand analysis job");
		},
	});
}

export async function getCloudAnalyzeBrandStatus(input: {
	organizationId: string;
	brandId: string;
}): Promise<AnalyzeBrandStatus> {
	return db.transaction(async (tx) => {
		await lockOrganizationCapacity(tx, input.organizationId);
		const brand = await assertCloudBrandOrganization(tx, input.organizationId, input.brandId);
		const stored = await loadCloudAdmissionForUpdate(tx, input.organizationId, input.brandId);
		if (!stored) return { status: "pending" };
		const requestFingerprint = cloudBrandAnalysisRequestFingerprint({
			brandId: brand.id,
			brandName: brand.name,
			website: brand.website,
		});
		if (stored.requestFingerprint !== requestFingerprint) {
			await failCloudAdmission(tx, stored, "Authoritative brand details changed during analysis", new Date());
			return { status: "failed", error: "Brand details changed. Start the analysis again." };
		}
		const admission = await repairCloudAdmission(tx, stored, new Date());
		if (admission.status === "completed") {
			const suggestion = onboardingSuggestionSchema.safeParse(admission.result);
			if (suggestion.success) return { status: "done", suggestion: suggestion.data };
		}
		if (admission.status === "failed") {
			console.error("[analyze-brand] admitted cloud job ended without a result", {
				organizationId: input.organizationId,
				brandId: input.brandId,
				jobId: admission.jobId,
				generation: admission.generation,
			});
			return { status: "failed", error: GENERIC_FAILURE };
		}
		return { status: "pending" };
	});
}

export async function cancelCloudAnalyzeBrand(input: { organizationId: string; brandId: string }): Promise<void> {
	const boss = await getBoss();
	await db.transaction(async (tx) => {
		await lockOrganizationCapacity(tx, input.organizationId);
		await assertCloudBrandOrganization(tx, input.organizationId, input.brandId);
		const stored = await loadCloudAdmissionForUpdate(tx, input.organizationId, input.brandId);
		if (!stored) return;
		const admission = await repairCloudAdmission(tx, stored, new Date());
		if (admission.status !== "pending" && admission.status !== "running") return;
		await boss.cancel(CLOUD_BRAND_ANALYSIS_QUEUE, admission.jobId, { db: fromDrizzle(tx, sql) });
		await failCloudAdmission(tx, admission, "Canceled by the user", new Date());
	});
}
