/**
 * SQL fragments shared by the raw (`postgres-read.ts`) and rollup
 * (`rollup-read.ts`) analytics reads, so both spell windows, prompt scopes, and
 * the model filter the same way.
 */

import { parseModelFilter } from "@workspace/config/model-filter";
import { db } from "@workspace/lib/db/db";
import { getAllProviders } from "@workspace/lib/providers";
import { type SQL, sql } from "drizzle-orm";

export async function queryPg<T>(query: SQL): Promise<T[]> {
	const result = await db.execute(query);
	return result.rows as T[];
}

/**
 * Two spellings reach here. The dashboard asks for calendar days, so
 * `YYYY-MM-DD` is resolved against `timezone` with `to` covering the whole of
 * its last day; `/api/v1` asks with instants, which are used as given.
 *
 * The only place that distinction exists — every window below is half-open.
 */
export const isCalendarDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function windowStart(from: string, timezone: string): SQL {
	return isCalendarDay(from) ? sql`(${from}::date AT TIME ZONE ${timezone})` : sql`${from}::timestamptz`;
}

export function windowEnd(to: string, timezone: string): SQL {
	return isCalendarDay(to) ? sql`((${to}::date + interval '1 day') AT TIME ZONE ${timezone})` : sql`${to}::timestamptz`;
}

/** Half-open window on `column`; no bounds means no predicate. */
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

/**
 * Provider ids that reach a model by calling it directly. Combined with
 * `web_search_enabled`, this is what separates a grounded API answer from the
 * same model scraped off its consumer product — `prompt_runs` records the
 * provider, and both rows carry `model = 'chatgpt'` with web search on.
 *
 * Caveat: a provider that picks its route per target (DataForSEO scrapes by
 * default and calls the API when a target pins a version) is classified by its
 * default here, since the row doesn't record which route ran.
 */
export const API_PROVIDER_IDS = getAllProviders()
	.filter((provider) => provider.access === "api")
	.map((provider) => provider.id);

/**
 * Narrow to one target. A bare model id means the standard platform; the
 * `::premium` variant means the grounded API call sold from the premium pool.
 *
 * The provider list is bound one parameter per id rather than as an array:
 * drizzle flattens a JS array into a single text parameter, which `ANY(...)`
 * then can't compare element-wise.
 */
export function modelFilter(model?: string, opts?: { alias?: string; source?: "prompt_runs" | "citations" }): SQL {
	const target = model ? parseModelFilter(model) : null;
	if (!target) return sql``;
	const prefix = opts?.alias ? sql.raw(`${opts.alias}.`) : sql``;
	// No API providers configured means nothing can be grounded, so the premium
	// side matches nothing and the standard side matches everything.
	if (API_PROVIDER_IDS.length === 0) {
		return target.premium ? sql`AND FALSE` : sql`AND ${prefix}model = ${target.model}`;
	}
	const providers = sql.join(
		API_PROVIDER_IDS.map((id) => sql`${id}`),
		sql`, `,
	);
	// A citation records which model cited it but not how that model was
	// reached, so the grounded test has to go through the run it came from.
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
