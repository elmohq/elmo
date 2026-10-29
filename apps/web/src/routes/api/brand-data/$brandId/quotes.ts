import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { promptRuns, runExtractions, runMentions } from "@workspace/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { QuoteText } from "@/lib/brand-data/memory-entity-reads";
import { authorizedBrand } from "@/routes/api/brand-data/-authorize";

const runIdsSchema = z.array(z.string().uuid()).min(1).max(50);

export const Route = createFileRoute("/api/brand-data/$brandId/quotes")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const denied = await authorizedBrand(params.brandId);
				if (denied) return denied;
				const runIds = runIdsSchema.safeParse(new URL(request.url).searchParams.get("runIds")?.split(","));
				if (!runIds.success) return Response.json({ error: "Invalid runIds" }, { status: 400 });
				const rows = await db
					.select({ id: promptRuns.id, assessments: runMentions.assessments, text: runExtractions.textContent })
					.from(promptRuns)
					.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id))
					.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
					.where(and(eq(promptRuns.brandId, params.brandId), inArray(promptRuns.id, runIds.data)));
				const quotes: QuoteText[] = rows.flatMap((row) =>
					row.assessments?.brand ? [{ id: row.id, brand: row.assessments.brand, text_content: row.text ?? "" }] : [],
				);
				return Response.json(quotes, { headers: { "Cache-Control": "private, max-age=3600" } });
			},
		},
	},
});
