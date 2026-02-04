import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { Client } from "pg";

export const dynamic = "force-dynamic";

async function withPgClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required");
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

		// Try to find the job in either the active jobs table or archive
		const job = await withPgClient(async (client) => {
			// Check if pgboss schema exists
			const schemaCheck = await client.query(
				`SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss')`,
			);

			if (!schemaCheck.rows[0]?.exists) {
				return null;
			}

			// Try active jobs first
			let result = await client.query(
				`SELECT id, name, data, state, output, retrycount, createdon, startedon, completedon
				 FROM pgboss.job
				 WHERE id = $1`,
				[jobId],
			);

			if (result.rows.length === 0) {
				// Try archive
				result = await client.query(
					`SELECT id, name, data, state, output, retrycount, createdon, startedon, completedon
					 FROM pgboss.archive
					 WHERE id = $1`,
					[jobId],
				);
			}

			return result.rows[0] || null;
		});

		if (!job) {
			return NextResponse.json({ error: "Job not found" }, { status: 404 });
		}

		// Format job details as logs
		const logs: string[] = [];

		logs.push(`Job ID: ${job.id}`);
		logs.push(`Name: ${job.name}`);
		logs.push(`State: ${job.state}`);
		logs.push(`Retry count: ${job.retrycount || 0}`);

		if (job.createdon) {
			logs.push(`Created: ${new Date(job.createdon).toISOString()}`);
		}
		if (job.startedon) {
			logs.push(`Started: ${new Date(job.startedon).toISOString()}`);
		}
		if (job.completedon) {
			logs.push(`Completed: ${new Date(job.completedon).toISOString()}`);
		}

		if (job.data) {
			try {
				const data = typeof job.data === "string" ? JSON.parse(job.data) : job.data;
				logs.push(`Data: ${JSON.stringify(data, null, 2)}`);
			} catch {
				logs.push(`Data: ${String(job.data)}`);
			}
		}

		if (job.output) {
			try {
				const output = typeof job.output === "string" ? JSON.parse(job.output) : job.output;
				if (job.state === "failed") {
					logs.push(`Error: ${JSON.stringify(output, null, 2)}`);
				} else {
					logs.push(`Output: ${JSON.stringify(output, null, 2)}`);
				}
			} catch {
				logs.push(`Output: ${String(job.output)}`);
			}
		}

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
