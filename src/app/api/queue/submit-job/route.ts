import { NextRequest, NextResponse } from "next/server";
import { promptQueue, devPromptQueue, prodPromptQueue } from "@/worker/queues";

export async function POST(request: NextRequest) {
	try {
		const { jobName, jobData, delay, queue } = await request.json();

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

		// Default job data if none provided
		const defaultJobData = {
			message: "Test job submitted from debug page",
			timestamp: new Date().toISOString(),
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
		});
	} catch (error) {
		console.error("Error submitting job to queue:", error);
		return NextResponse.json(
			{ error: "Failed to submit job to queue" }, 
			{ status: 500 }
		);
	}
} 