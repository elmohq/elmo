import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { Client } from "pg";

export const dynamic = "force-dynamic";

async function withDbosClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
	const connectionString = process.env.DBOS_SYSTEM_DATABASE_URL;
	if (!connectionString) {
		throw new Error("DBOS_SYSTEM_DATABASE_URL is required");
	}

	const client = new Client({ connectionString });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

export async function GET(request: NextRequest) {
	try {
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const searchParams = request.nextUrl.searchParams;
		const jobId = searchParams.get("jobId");

		if (!jobId) {
			return NextResponse.json({ error: "jobId is required" }, { status: 400 });
		}

		const rows = await withDbosClient(async (client) => {
			const result = await client.query(
				`SELECT function_name, output, error, started_at_epoch_ms, completed_at_epoch_ms
				 FROM dbos.operation_outputs
				 WHERE workflow_uuid = $1
				 ORDER BY function_id ASC`,
				[jobId],
			);
			return result.rows;
		});

		const logs = rows.map((row) => {
			const startedAt = row.started_at_epoch_ms ? new Date(Number(row.started_at_epoch_ms)).toISOString() : "unknown";
			const completedAt = row.completed_at_epoch_ms ? new Date(Number(row.completed_at_epoch_ms)).toISOString() : "unknown";
			const output = row.output ? JSON.stringify(row.output) : "";
			const error = row.error ? JSON.stringify(row.error) : "";
			return `[${startedAt} - ${completedAt}] ${row.function_name} ${error ? `ERROR: ${error}` : output}`;
		});

		return NextResponse.json({
			jobId,
			logs,
			count: logs.length,
		});
	} catch (error) {
		console.error("Error fetching job logs:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
