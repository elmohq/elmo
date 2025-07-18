import { NextRequest, NextResponse } from "next/server";
import { promptQueue } from "@/worker/queues";
import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getElmoOrgs } from "@/lib/metadata";

// Type definitions for job data structures
type PromptJobData = {
	promptId: string;
};

type GeneralJobData = {
	brandId: string;
	[key: string]: any;
};

type JobData = PromptJobData | GeneralJobData;

export async function POST(request: NextRequest) {
	try {
		const { promptId } = await request.json();

		if (!promptId || typeof promptId !== "string") {
			return NextResponse.json({ error: "Prompt ID is required" }, { status: 400 });
		}

		// Verify the prompt exists and user has access
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		// Check if user has access to this brand
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === prompt.brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this prompt" }, { status: 403 });
		}

		// Submit job to queue
		const job = await promptQueue.add(
			`manual-prompt-${promptId}`, // Use unique job name pattern
			{ promptId },
			{
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 2000,
				},
				// Add job options for better tracking
				removeOnComplete: 5000, // Keep last 5000 completed jobs
				removeOnFail: 5000, // Keep last 5000 failed jobs
			},
		);

		return NextResponse.json({
			success: true,
			jobId: job.id,
			promptId,
			promptValue: prompt.value,
			message: `Job submitted to process prompt: "${prompt.value}"`,
		});
	} catch (error) {
		console.error("Error submitting prompt processing job:", error);
		return NextResponse.json({ error: "Failed to submit job" }, { status: 500 });
	}
}

// GET endpoint to check job status (optional)
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const jobId = searchParams.get("jobId");
		const brandId = searchParams.get("brandId");

		if (!jobId) {
			return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
		}

		if (!brandId) {
			return NextResponse.json({ error: "Brand ID is required" }, { status: 400 });
		}

		// Check if user has access to this brand
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		const job = await promptQueue.getJob(jobId);

		if (!job) {
			return NextResponse.json({ error: "Job not found" }, { status: 404 });
		}

		const jobData = job.data as JobData;

		// Additional security check: verify the job belongs to the specified brand
		if ("brandId" in jobData) {
			// For general jobs that include brandId directly
			if (jobData.brandId !== brandId) {
				return NextResponse.json({ error: "Access denied to this job" }, { status: 403 });
			}
		} else if ("promptId" in jobData) {
			// For prompt jobs, look up the prompt to verify brand ownership
			const prompt = await db.query.prompts.findFirst({
				where: eq(prompts.id, jobData.promptId),
			});

			if (!prompt) {
				return NextResponse.json({ error: "Associated prompt not found" }, { status: 404 });
			}

			if (prompt.brandId !== brandId) {
				return NextResponse.json({ error: "Access denied to this job" }, { status: 403 });
			}
		} else {
			// Unknown job data structure - deny access for security
			return NextResponse.json({ error: "Invalid job data structure" }, { status: 400 });
		}

		return NextResponse.json({
			jobId: job.id,
			name: job.name,
			data: job.data,
			progress: job.progress,
			processedOn: job.processedOn,
			finishedOn: job.finishedOn,
			failedReason: job.failedReason,
			returnvalue: job.returnvalue,
		});
	} catch (error) {
		console.error("Error checking job status:", error);
		return NextResponse.json({ error: "Failed to check job status" }, { status: 500 });
	}
}
