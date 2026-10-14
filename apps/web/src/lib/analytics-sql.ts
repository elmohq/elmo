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

function windowStart(from: string, timezone: string): SQL {
	return isCalendarDay(from) ? localMidnight(sql`${from}::date`, timezone) : sql`${from}::timestamptz`;
}

function windowEnd(to: string, timezone: string): SQL {
	return isCalendarDay(to) ? localMidnight(sql`(${to}::date + 1)`, timezone) : sql`${to}::timestamptz`;
}

export function windowFilter(column: SQL, fromDate: string | null, toDate: string | null, timezone: string): SQL {
	const from = fromDate ? sql`AND ${column} >= ${windowStart(fromDate, timezone)}` : sql``;
	const to = toDate ? sql`AND ${column} < ${windowEnd(toDate, timezone)}` : sql``;
	return sql`${from} ${to}`;
}

/** The calendar day `column` falls on in `timezone`. */
export function localDate(column: SQL, timezone: string): SQL {
	return sql`(${column} AT TIME ZONE ${timezone})::date`;
}

// Whole seconds with a fixed `.000Z`, the shape the dashboard has always published.
export function isoInstant(value: SQL): SQL {
	return sql`to_char(${value} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z'`;
}

export function uuidList(ids: string[]): SQL {
	return sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
}

/** What an analytics read covers. Every read filters on all of it. */
export interface AnalyticsScope {
	brandId: string;
	/** A calendar day (YYYY-MM-DD, read in `timezone`) or an instant; null for unbounded. */
	from: string | null;
	/** A calendar day (inclusive) or an instant (exclusive); null for unbounded. */
	to: string | null;
	timezone: string;
	/** Undefined for every prompt; an empty list matches nothing. */
	promptIds?: string[];
	model?: string;
	webSearchEnabled?: boolean;
}

/** A scope over an explicit list of prompts, for reads that join or page through them. */
export type PromptListScope = AnalyticsScope & { promptIds: string[] };

/** A bounded window over an explicit list of prompts, for reads that lay out every day. */
export type DailyScope = PromptListScope & { from: string; to: string };

interface ScopeColumns {
	/** Rollups are windowed on their bucket, raw rows on when they were written. */
	time: "bucket" | "created_at";
	alias?: string;
}

const column = (name: string, alias?: string): SQL => sql.raw(alias ? `${alias}.${name}` : name);

/** The whole WHERE body for `scope`, over a table carrying the shared run columns. */
export function scopeFilter(scope: AnalyticsScope, columns: ScopeColumns): SQL {
	const { alias } = columns;
	return sql`${column("brand_id", alias)} = ${scope.brandId}
		${windowFilter(column(columns.time, alias), scope.from, scope.to, scope.timezone)}
		${promptFilter(scope.promptIds, alias)}
		${modelFilter(scope.model, { alias })}
		${webSearchFilter(scope.webSearchEnabled, alias)}`;
}

function promptFilter(promptIds: string[] | undefined, alias?: string): SQL {
	if (!promptIds) return sql``;
	if (promptIds.length === 0) return sql`AND FALSE`;
	return sql`AND ${column("prompt_id", alias)} IN (${uuidList(promptIds)})`;
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
	const col = (name: string) => column(name, opts?.alias);
	if (API_PROVIDER_IDS.length === 0) {
		return target.premium ? sql`AND FALSE` : sql`AND ${col("model")} = ${target.model}`;
	}
	const grounded = sql`(${col("web_search_enabled")} AND coalesce(${col("provider")}, '') IN (${apiProviderList()}))`;
	return sql`AND ${col("model")} = ${target.model} AND ${target.premium ? grounded : sql`NOT ${grounded}`}`;
}

export function apiProviderList(): SQL {
	return sql.join(
		API_PROVIDER_IDS.map((id) => sql`${id}`),
		sql`, `,
	);
}

function webSearchFilter(webSearchEnabled: boolean | undefined, alias?: string): SQL {
	if (webSearchEnabled === undefined) return sql``;
	return sql`AND ${column("web_search_enabled", alias)} = ${webSearchEnabled}`;
}
