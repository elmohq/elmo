import { type GenerateOpportunitiesOutcome, generateOpportunities } from "@workspace/lib/opportunities";
import type { Job } from "pg-boss";

export interface GenerateOpportunitiesData {
	brandId: string;
	timezone: string;
}

export async function generateOpportunitiesJob(
	jobs: Job<GenerateOpportunitiesData>[],
): Promise<GenerateOpportunitiesOutcome> {
	const [job] = jobs;
	if (!job) throw new Error("generate-opportunities handler received an empty batch");
	return generateOpportunities(job.data.brandId, job.data.timezone);
}
