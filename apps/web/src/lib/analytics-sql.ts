import { parseModelFilter } from "@workspace/config/model-filter";
import { db } from "@workspace/lib/db/db";
import { getAllProviders } from "@workspace/lib/providers";
import { type SQL, sql } from "drizzle-orm";

export async function queryPg<T>(query: SQL): Promise<T[]> {
	const result = await db.execute(query);
	return result.rows as T[];
}

// The dashboard passes calendar days (resolved in `timezone`, `to` inclusive of its
// whole day); `/api/v1` passes instants, used as given.
export const isCalendarDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// A bare date would pick the timestamptz overload of AT TIME ZONE, which converts
// the other way: midnight in the session's zone, as wall time in this one.
const localMidnight = (day: SQL, timezone: string): SQL => sql`(${day}::timestamp AT TIME ZONE ${timezone})`;

export function windowStart(from: string, timezone: string): SQL {
	return isCalendarDay(from) ? localMidnight(sql`${from}::date`, timezone) : sql`${from}::timestamptz`;
}

export function windowEnd(to: string, timezone: string): SQL {
	return isCalendarDay(to) ? localMidnight(sql`(${to}::date + 1)`, timezone) : sql`${to}::timestamptz`;
}

export function windowFilter(column: SQL, fromDate: string | null, toDate: string | null, timezone: string): SQL {
	const from = fromDate ? sql`AND ${column} >= ${windowStart(fromDate, timezone)}` : sql``;
	const to = toDate ? sql`AND ${column} < ${windowEnd(toDate, timezone)}` : sql``;
	return sql`${from} ${to}`;
}

export function uuidList(ids: string[]): SQL {
	return sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
}

/** Without ids, every prompt; an empty list is an empty scope. */
export function promptFilter(promptIds?: string[]): SQL {
	if (!promptIds) return sql``;
	if (promptIds.length === 0) return sql`AND FALSE`;
	return sql`AND prompt_id IN (${uuidList(promptIds)})`;
}

// With `web_search_enabled`, the provider is what separates a grounded API answer from
// the same model scraped off its consumer product; both rows carry the same `model`.
// A provider that picks its route per target (DataForSEO) is classified by its default,
// since the row doesn't record which route ran. Older runs have no provider; rollups
// store that as '', and both read it as not an API route.
export const API_PROVIDER_IDS = getAllProviders()
	.filter((provider) => provider.access === "api")
	.map((provider) => provider.id);

// Providers are bound one parameter per id, not as an array: drizzle flattens a JS
// array into a single text parameter, which `ANY(...)` can't compare element-wise.
export function modelFilter(model?: string, opts?: { alias?: string }): SQL {
	const target = model ? parseModelFilter(model) : null;
	if (!target) return sql``;
	const prefix = opts?.alias ? sql.raw(`${opts.alias}.`) : sql``;
	if (API_PROVIDER_IDS.length === 0) {
		return target.premium ? sql`AND FALSE` : sql`AND ${prefix}model = ${target.model}`;
	}
	const grounded = sql`(${prefix}web_search_enabled AND coalesce(${prefix}provider, '') IN (${apiProviderList()}))`;
	return sql`AND ${prefix}model = ${target.model} AND ${target.premium ? grounded : sql`NOT ${grounded}`}`;
}

export function apiProviderList(): SQL {
	return sql.join(
		API_PROVIDER_IDS.map((id) => sql`${id}`),
		sql`, `,
	);
}

export function webSearchFilter(webSearchEnabled?: boolean): SQL {
	if (webSearchEnabled === undefined) return sql``;
	return sql`AND web_search_enabled = ${webSearchEnabled}`;
}
