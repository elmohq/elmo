import { getDeployment } from "@workspace/deployment";
import {
	beginCloudBrandAnalysisProviderCall,
	CLOUD_BRAND_ANALYSIS_MAX_WEB_SEARCH_USES,
	type CloudBrandAnalysisJobData,
	completeCloudBrandAnalysisAdmission,
	failCloudBrandAnalysisAdmission,
	hasCloudBrandAnalysisJobMarker,
	isCloudBrandAnalysisJobData,
} from "@workspace/lib/cloud/brand-analysis-admission";
import {
	analyzeBrand,
	type LegacyAnalyzeBrandJobData,
	legacyAnalyzeBrandJobDataSchema,
	type OnboardingSuggestion,
} from "@workspace/lib/onboarding";
import type { JobWithMetadata } from "pg-boss";

export type AnalyzeBrandData = LegacyAnalyzeBrandJobData | CloudBrandAnalysisJobData;

/**
 * Run brand analysis as a background job.
 *
 * The onboarding wizard used to call analyzeBrand() synchronously inside the
 * HTTP request. That call is an LLM + web-search round trip that routinely
 * takes ~1 minute, so it gets killed by reverse-proxy read timeouts (the user
 * sees a 504 even though the work finishes). Running it here lets the request
 * return immediately; the web app polls the job's `output` via getJobById.
 *
 * The queue is registered with batchSize: 1, so `jobs` always holds exactly
 * one job and the returned suggestion becomes that job's output.
 */
export async function analyzeBrandJob(
	jobs: JobWithMetadata<AnalyzeBrandData>[],
	mode = getDeployment().mode,
): Promise<OnboardingSuggestion> {
	const [job] = jobs;
	if (!job) {
		throw new Error("analyze-brand handler received an empty batch");
	}

	const data = job.data;
	const cloudData = isCloudBrandAnalysisJobData(data) ? data : undefined;
	if (!cloudData && hasCloudBrandAnalysisJobMarker(data)) {
		throw new Error("analyze-brand received an invalid or unsupported cloud admission payload");
	}
	const legacyData = cloudData ? undefined : legacyAnalyzeBrandJobDataSchema.safeParse(data).data;
	if (!cloudData && !legacyData) {
		throw new Error("analyze-brand received an invalid legacy payload");
	}
	if (mode === "cloud" && !cloudData) {
		throw new Error("Cloud analyze-brand jobs require a durable admission payload");
	}
	if (mode !== "cloud" && cloudData) {
		throw new Error("Cloud analyze-brand jobs cannot run in a noncloud deployment");
	}
	if (cloudData && (job.retryLimit !== 0 || job.retryCount !== 0)) {
		throw new Error("Cloud analyze-brand jobs must be first-attempt jobs with retries disabled");
	}
	const cloudProviderInput = cloudData
		? await beginCloudBrandAnalysisProviderCall({ jobId: job.id, data: cloudData })
		: undefined;
	if (cloudData && !cloudProviderInput) throw new Error("Cloud analyze-brand job has no current pending admission");
	try {
		const result = await analyzeBrand({
			website: cloudProviderInput?.website ?? legacyData?.website ?? "",
			brandName: cloudProviderInput?.brandName ?? legacyData?.brandName,
			...(cloudData
				? { maxProviderRetries: 0, maxWebSearchUses: CLOUD_BRAND_ANALYSIS_MAX_WEB_SEARCH_USES }
				: { maxCompetitors: legacyData?.maxCompetitors, maxPrompts: legacyData?.maxPrompts }),
		});
		if (cloudData) {
			const persisted = await completeCloudBrandAnalysisAdmission({ jobId: job.id, data: cloudData, result });
			if (!persisted) throw new Error("Cloud brand-analysis result lost its running admission");
		}
		return result;
	} catch (error) {
		if (cloudData) {
			try {
				await failCloudBrandAnalysisAdmission({ jobId: job.id, data: cloudData, error });
			} catch (persistenceError) {
				throw new AggregateError([error, persistenceError], "Brand analysis and its durable failure projection failed");
			}
		}
		throw error;
	}
}
