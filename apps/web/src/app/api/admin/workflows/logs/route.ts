import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { devPromptQueue, prodPromptQueue } from "@workspace/lib/queues";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const searchParams = request.nextUrl.searchParams;
		const jobId = searchParams.get("jobId");
		const environment = searchParams.get("environment");

		if (!jobId) {
			return NextResponse.json({ error: "jobId is required" }, { status: 400 });
		}

		if (!environment || (environment !== "dev" && environment !== "prod")) {
			return NextResponse.json({ error: "environment must be 'dev' or 'prod'" }, { status: 400 });
		}

		const queue = environment === "prod" ? prodPromptQueue : devPromptQueue;

		// Get job logs
		const logsResult = await queue.getJobLogs(jobId);

		return NextResponse.json({
			jobId,
			environment,
			logs: logsResult.logs,
			count: logsResult.count,
		});
	} catch (error) {
		console.error("Error fetching job logs:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

