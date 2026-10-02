import { parseModelFilter } from "@workspace/config/model-filter";
import { db } from "@workspace/lib/db/db";
import { getAllProviders } from "@workspace/lib/providers";
import { BUCKET_MINUTES, bucketSql } from "@workspace/lib/rollups";
import { type SQL, sql } from "drizzle-orm";

export async function queryPg<T>(query: SQL): Promise<T[]> {
	const result = await db.execute(query);
	return result.rows as T[];
}

// The dashboard passes calendar days (resolved in `timezone`, `to` inclusive of its
// whole day); `/api/v1` passes instants, used as given.
export const isCalendarDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Rollups put a bucket on the local day its start falls on. Where local midnight
 * isn't on a bucket boundary (Asia/Kathmandu, +05:45), a day therefore begins at
 * the first boundary after midnight, up to a quarter hour late. Raw reads use the
 * same bound, so a run lands on the same day whichever table counts it.
 */
function dayStart(day: SQL, timezone: string): SQL {
	// A bare date would pick the timestamptz overload of AT TIME ZONE, which
	// converts the other way: midnight in the session's zone, as wall time in this one.
	const midnight = sql`(${day}::timestamp AT TIME ZONE ${timezone})`;
	return bucketSql(sql`${midnight} + ${sql.raw(`interval '${BUCKET_MINUTES} minutes'`)} - interval '1 microsecond'`);
}

export function windowStart(from: string, timezone: string): SQL {
	return isCalendarDay(from) ? dayStart(sql`${from}::date`, timezone) : sql`${from}::timestamptz`;
}

export function windowEnd(to: string, timezone: string): SQL {
	return isCalendarDay(to) ? dayStart(sql`(${to}::date + 1)`, timezone) : sql`${to}::timestamptz`;
}

export function windowFilter(column: SQL, fromDate: string | null, toDate: string | null, timezone: string): SQL {
	if (!fromDate || !toDate) return sql``;
	return sql`AND ${column} >= ${windowStart(fromDate, timezone)} AND ${column} < ${windowEnd(toDate, timezone)}`;
}

export function uuidList(ids: string[]): SQL {
	return sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
}

export function promptIdFilter(enabledPromptIds?: string[]): SQL {
	if (!enabledPromptIds?.length) return sql``;
	return sql`AND prompt_id IN (${uuidList(enabledPromptIds)})`;
}

// With `web_search_enabled`, the provider is what separates a grounded API answer from
// the same model scraped off its consumer product; both rows carry the same `model`.
// A provider that picks its route per target (DataForSEO) is classified by its default,
// since the row doesn't record which route ran.
export const API_PROVIDER_IDS = getAllProviders()
	.filter((provider) => provider.access === "api")
	.map((provider) => provider.id);

// Providers are bound one parameter per id, not as an array: drizzle flattens a JS
// array into a single text parameter, which `ANY(...)` can't compare element-wise.
export function modelFilter(model?: string, opts?: { alias?: string; source?: "prompt_runs" | "citations" }): SQL {
	const target = model ? parseModelFilter(model) : null;
	if (!target) return sql``;
	const prefix = opts?.alias ? sql.raw(`${opts.alias}.`) : sql``;
	if (API_PROVIDER_IDS.length === 0) {
		return target.premium ? sql`AND FALSE` : sql`AND ${prefix}model = ${target.model}`;
	}
	const providers = sql.join(
		API_PROVIDER_IDS.map((id) => sql`${id}`),
		sql`, `,
	);
	// A citation doesn't record how its model was reached, so check via its run.
	const grounded =
		opts?.source === "citations"
			? sql`EXISTS (
					SELECT 1 FROM prompt_runs AS mf_run
					WHERE mf_run.id = ${prefix}prompt_run_id
						AND mf_run.web_search_enabled
						AND mf_run.provider IN (${providers})
				)`
			: sql`(${prefix}web_search_enabled AND ${prefix}provider IN (${providers}))`;
	return sql`AND ${prefix}model = ${target.model} AND ${target.premium ? grounded : sql`NOT ${grounded}`}`;
}

export function webSearchFilter(webSearchEnabled?: boolean): SQL {
	if (webSearchEnabled === undefined) return sql``;
	return sql`AND web_search_enabled = ${webSearchEnabled}`;
}
