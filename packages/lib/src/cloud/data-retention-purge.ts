import { and, eq, inArray, isNull } from "drizzle-orm";
import type { db } from "../db/db";
import {
	apikey,
	brandAnalysisAdmissions,
	brandOpportunities,
	brandSchedulerRollouts,
	brands,
	brandTargetSelections,
	citations,
	competitors,
	promptRuns,
	prompts,
	promptTargetAssignments,
	reports,
	trackingOccurrences,
	trackingProviderAttempts,
	trackingSchedules,
	trackingTasks,
} from "../db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CloudProductPurgeSummary extends Record<string, number> {
	apiKeys: number;
	reports: number;
	providerAttemptsArchived: number;
	citations: number;
	opportunityReports: number;
	competitors: number;
	trackingTasks: number;
	trackingOccurrences: number;
	trackingSchedules: number;
	promptTargetAssignments: number;
	brandTargetSelections: number;
	brandSchedulerRollouts: number;
	promptRuns: number;
	brandAnalysisAdmissions: number;
	prompts: number;
	brands: number;
}

export function buildRetainedProviderAttemptUpdate(retentionRunId: string, now: Date) {
	return {
		taskId: null,
		brandId: null,
		promptId: null,
		promptRunId: null,
		providerRequestId: null,
		errorMessage: null,
		retentionRunId,
		updatedAt: now,
	};
}

/**
 * Removes only organization-owned product data. Billing-grade provider usage
 * is content-scrubbed and detached before operational rows are deleted.
 */
export async function purgeCloudOrganizationProductDataInTransaction(
	tx: DbTransaction,
	input: { organizationId: string; retentionRunId: string; now: Date },
): Promise<CloudProductPurgeSummary> {
	const brandRows = await tx
		.select({ id: brands.id })
		.from(brands)
		.where(eq(brands.organizationId, input.organizationId));
	const brandIds = brandRows.map((brand) => brand.id);

	const apiKeyRows = await tx
		.delete(apikey)
		.where(eq(apikey.referenceId, input.organizationId))
		.returning({ id: apikey.id });
	const reportRows = await tx
		.delete(reports)
		.where(eq(reports.organizationId, input.organizationId))
		.returning({ id: reports.id });
	const archivedAttemptRows = await tx
		.update(trackingProviderAttempts)
		.set(buildRetainedProviderAttemptUpdate(input.retentionRunId, input.now))
		.where(
			and(
				eq(trackingProviderAttempts.organizationId, input.organizationId),
				isNull(trackingProviderAttempts.retentionRunId),
			),
		)
		.returning({ id: trackingProviderAttempts.id });

	if (brandIds.length === 0) {
		return {
			apiKeys: apiKeyRows.length,
			reports: reportRows.length,
			providerAttemptsArchived: archivedAttemptRows.length,
			citations: 0,
			opportunityReports: 0,
			competitors: 0,
			trackingTasks: 0,
			trackingOccurrences: 0,
			trackingSchedules: 0,
			promptTargetAssignments: 0,
			brandTargetSelections: 0,
			brandSchedulerRollouts: 0,
			promptRuns: 0,
			brandAnalysisAdmissions: 0,
			prompts: 0,
			brands: 0,
		};
	}

	const citationRows = await tx
		.delete(citations)
		.where(inArray(citations.brandId, brandIds))
		.returning({ id: citations.id });
	const opportunityRows = await tx
		.delete(brandOpportunities)
		.where(inArray(brandOpportunities.brandId, brandIds))
		.returning({ id: brandOpportunities.id });
	const competitorRows = await tx
		.delete(competitors)
		.where(inArray(competitors.brandId, brandIds))
		.returning({ id: competitors.id });
	const taskRows = await tx
		.delete(trackingTasks)
		.where(inArray(trackingTasks.brandId, brandIds))
		.returning({ id: trackingTasks.id });
	const occurrenceRows = await tx
		.delete(trackingOccurrences)
		.where(inArray(trackingOccurrences.brandId, brandIds))
		.returning({ id: trackingOccurrences.id });
	const scheduleRows = await tx
		.delete(trackingSchedules)
		.where(inArray(trackingSchedules.brandId, brandIds))
		.returning({ id: trackingSchedules.id });
	const assignmentRows = await tx
		.delete(promptTargetAssignments)
		.where(inArray(promptTargetAssignments.brandId, brandIds))
		.returning({ id: promptTargetAssignments.id });
	const selectionRows = await tx
		.delete(brandTargetSelections)
		.where(inArray(brandTargetSelections.brandId, brandIds))
		.returning({ id: brandTargetSelections.id });
	const rolloutRows = await tx
		.delete(brandSchedulerRollouts)
		.where(inArray(brandSchedulerRollouts.brandId, brandIds))
		.returning({ id: brandSchedulerRollouts.brandId });
	const promptRunRows = await tx
		.delete(promptRuns)
		.where(inArray(promptRuns.brandId, brandIds))
		.returning({ id: promptRuns.id });
	const analysisRows = await tx
		.delete(brandAnalysisAdmissions)
		.where(inArray(brandAnalysisAdmissions.brandId, brandIds))
		.returning({ id: brandAnalysisAdmissions.brandId });
	const promptRows = await tx.delete(prompts).where(inArray(prompts.brandId, brandIds)).returning({ id: prompts.id });
	const deletedBrandRows = await tx
		.delete(brands)
		.where(and(eq(brands.organizationId, input.organizationId), inArray(brands.id, brandIds)))
		.returning({ id: brands.id });

	return {
		apiKeys: apiKeyRows.length,
		reports: reportRows.length,
		providerAttemptsArchived: archivedAttemptRows.length,
		citations: citationRows.length,
		opportunityReports: opportunityRows.length,
		competitors: competitorRows.length,
		trackingTasks: taskRows.length,
		trackingOccurrences: occurrenceRows.length,
		trackingSchedules: scheduleRows.length,
		promptTargetAssignments: assignmentRows.length,
		brandTargetSelections: selectionRows.length,
		brandSchedulerRollouts: rolloutRows.length,
		promptRuns: promptRunRows.length,
		brandAnalysisAdmissions: analysisRows.length,
		prompts: promptRows.length,
		brands: deletedBrandRows.length,
	};
}
