/**
 * Server function for the Query Fanout page. Read-only — derived entirely from
 * `prompt_runs.web_queries` (the sub-queries engines run while answering a
 * prompt), uniformly across providers. Engines that don't expose their
 * searches contribute runs but no queries. No schema changes.
 *
 * Filters (tags/search → prompt IDs, lookback → date range in the user's
 * timezone) are resolved server-side exactly like Share of Voice, so the same
 * prompt set and window back every figure on the page. See `server/analysis.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { computeQueryFanout, type QueryFanoutResponse, queryFanoutInput } from "@/lib/analytics/pages/query-fanout";
import { pgReader } from "@/lib/analytics/pg-reader";
import { requireBrandSession } from "@/lib/auth/helpers";

export type { QueryFanoutResponse } from "@/lib/analytics/pages/query-fanout";

export const getQueryFanoutFn = createServerFn({ method: "GET" })
	.validator(queryFanoutInput)
	.handler(async ({ data }): Promise<QueryFanoutResponse> => {
		await requireBrandSession(data.brandId);
		return computeQueryFanout(pgReader, data);
	});
