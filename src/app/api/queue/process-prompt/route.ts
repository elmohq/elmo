import { NextRequest, NextResponse } from "next/server";
import { promptQueue } from "@/worker/queues";
import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getElmoOrgs } from "@/lib/metadata";

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
      "process-prompt",
      { promptId },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        // Add job options for better tracking
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 5, // Keep last 5 failed jobs
      }
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
    return NextResponse.json(
      { error: "Failed to submit job" },
      { status: 500 }
    );
  }
}

// GET endpoint to check job status (optional)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    const job = await promptQueue.getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
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
    return NextResponse.json(
      { error: "Failed to check job status" },
      { status: 500 }
    );
  }
} 