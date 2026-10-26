/**
 * /api/health - Readiness check for uptime monitoring
 *
 * Returns 503 when the database can't answer, since nearly every page and API
 * call needs it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import { readinessResponse } from "@/lib/readiness";

export const Route = createFileRoute("/api/health/")({
	server: {
		handlers: {
			GET: () => readinessResponse(() => db.execute(sql`select 1`)),
		},
	},
});
