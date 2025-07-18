import { NextRequest, NextResponse } from "next/server";
import { promptQueue, devPromptQueue, prodPromptQueue } from "@/worker/queues";
import { getElmoOrgs } from "@/lib/metadata";
import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
	try {
		const { jobName, jobData, delay, queue, brandId } = await request.json();

		// Require brandId for authorization
		if (!brandId || typeof brandId !== "string") {
			return NextResponse.json({ error: "Brand ID is required" }, { status: 400 });
		}

		// Check if user has access to this brand
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		if (jobData && typeof jobData === 'object' && 'promptId' in jobData) {
			const promptId = jobData.promptId;
			
			if (typeof promptId === 'string') {
				const prompt = await db.query.prompts.findFirst({
					where: eq(prompts.id, promptId),
				});

				if (!prompt) {
					return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
				}

				if (prompt.brandId !== brandId) {
					return NextResponse.json({ error: "Access denied: prompt does not belong to specified brand" }, { status: 403 });
				}
			}
		}

		// Select queue based on parameter, defaulting to environment-based selection
		let selectedQueue;
		switch (queue) {
			case 'dev':
				selectedQueue = devPromptQueue;
				break;
			case 'prod':
				selectedQueue = prodPromptQueue;
				break;
			default:
				selectedQueue = promptQueue; // Uses environment-based selection
		}

		// Default job data if none provided, always include brandId for tracking
		const defaultJobData = {
			message: "Test job submitted from debug page",
			timestamp: new Date().toISOString(),
			brandId, // Include brandId in job data for tracking
			...jobData
		};

		// Submit job to queue
		const job = await selectedQueue.add(
			jobName || "test-job", 
			defaultJobData,
			{
				delay: delay || 0, // delay in milliseconds
				attempts: 3,
				backoff: {
					type: 'exponential',
					delay: 2000,
				},
			}
		);

		return NextResponse.json({
			success: true,
			jobId: job.id,
			jobName: job.name,
			data: job.data,
			queue: selectedQueue.name,
			brandId,
		});
	} catch (error) {
		console.error("Error submitting job to queue:", error);
		return NextResponse.json(
			{ error: "Failed to submit job to queue" }, 
			{ status: 500 }
		);
	}
} 