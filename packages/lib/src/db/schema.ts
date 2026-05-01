import { pgEnum, pgTable, uuid, text, timestamp, date, boolean, json, index, integer, smallint, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Better-auth tables & relations — re-exported so `import * as schema` sees everything.
// Source file is auto-generated; run `pnpm run generate:auth-schema` to refresh.
export * from "./schema-auth";

// ============================================================================
// Application tables
// ============================================================================

export const reportStatusEnum = pgEnum("report_status", ["pending", "processing", "completed", "failed"]);

export const brands = pgTable("brands", {
	id: text("id").primaryKey().notNull(),
	name: text("name").notNull(),
	website: text("website").notNull(),
	additionalDomains: text("additional_domains").array().notNull().default([]),
	aliases: text("aliases").array().notNull().default([]),
	enabled: boolean("enabled").default(true).notNull(),
	onboarded: boolean("onboarded").default(false).notNull(),
	delayOverrideHours: integer("delay_override_hours"),
	enabledModels: text("enabled_models").array(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}).enableRLS();

export const prompts = pgTable(
	"prompts",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		value: text("value").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		tags: text("tags").array().notNull().default([]),
		systemTags: text("system_tags").array().notNull().default([]),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		brandIdIdx: index("prompts_brand_id_idx").on(table.brandId),
		brandIdEnabledIdx: index("prompts_brand_id_enabled_idx").on(table.brandId, table.enabled),
	}),
).enableRLS();

export const competitors = pgTable("competitors", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	brandId: text("brand_id")
		.references(() => brands.id)
		.notNull(),
	name: text("name").notNull(),
	domains: text("domains").array().notNull().default([]),
	aliases: text("aliases").array().notNull().default([]),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}).enableRLS();

export const promptRuns = pgTable(
	"prompt_runs",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		promptId: uuid("prompt_id")
			.references(() => prompts.id)
			.notNull(),
		brandId: text("brand_id").references(() => brands.id).notNull(),
		model: text("model").notNull(),
		provider: text("provider"),
		version: text("version").notNull(),
		webSearchEnabled: boolean("web_search_enabled").notNull(),
		rawOutput: json("raw_output").notNull(),
		webQueries: text("web_queries").array().notNull().default([]),
		brandMentioned: boolean("brand_mentioned").notNull(),
		competitorsMentioned: text("competitors_mentioned").array().notNull().default([]),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		promptIdCreatedAtIdx: index("prompt_runs_prompt_id_created_at_idx").on(table.promptId, table.createdAt),
		createdAtIdx: index("prompt_runs_created_at_idx").on(table.createdAt),
		webSearchCreatedAtIdx: index("prompt_runs_web_search_created_at_idx").on(table.webSearchEnabled, table.createdAt),
		webSearchModelCreatedAtIdx: index("prompt_runs_web_search_model_created_at_idx").on(table.webSearchEnabled, table.model, table.createdAt),
		providerIdx: index("prompt_runs_provider_idx").on(table.provider),
		modelCreatedAtIdx: index("prompt_runs_model_created_at_idx").on(table.model, table.createdAt),
	}),
).enableRLS();

export const citations = pgTable(
	"citations",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		promptRunId: uuid("prompt_run_id")
			.references(() => promptRuns.id)
			.notNull(),
		promptId: uuid("prompt_id")
			.references(() => prompts.id)
			.notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		model: text("model").notNull(),
		url: text("url").notNull(),
		domain: text("domain").notNull(),
		title: text("title"),
		citationIndex: smallint("citation_index").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	},
	(table) => ({
		brandAnalyticsIdx: index("idx_citations_brand_analytics").on(table.brandId, table.createdAt, table.url, table.domain, table.title, table.promptId, table.model),
		promptCreatedIdx: index("citations_prompt_id_created_at_idx").on(table.promptId, table.createdAt),
		domainIdx: index("citations_domain_idx").on(table.domain),
	}),
).enableRLS();

export const reports = pgTable(
	"reports",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandName: text("brand_name").notNull(),
		brandWebsite: text("brand_website").notNull(),
		status: reportStatusEnum().notNull().default("pending"),
		progress: integer("progress").notNull().default(0),
		rawOutput: json("raw_output"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		createdAtIdx: index("reports_created_at_idx").on(table.createdAt),
	}),
).enableRLS();

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;

export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;

export type PromptRun = typeof promptRuns.$inferSelect;
export type NewPromptRun = typeof promptRuns.$inferInsert;

export type BrandWithPrompts = Brand & {
	prompts: Prompt[];
	competitors: Competitor[];
};

export type CitationRecord = typeof citations.$inferSelect;
export type NewCitationRecord = typeof citations.$inferInsert;

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

export const SYSTEM_TAGS = {
	BRANDED: "branded",
	UNBRANDED: "unbranded",
} as const;

export type SystemTag = (typeof SYSTEM_TAGS)[keyof typeof SYSTEM_TAGS];

// ============================================================================
// Worker-maintained hourly aggregates
// ============================================================================
//
// These tables back the analytics queries that drive the overview, visibility,
// citations, and prompt-detail pages. A pg-boss job (apps/worker) rebuilds
// affected (brand_id, UTC date) buckets every minute. Reads happen via
// apps/web/src/lib/postgres-read.ts, which re-buckets the hourly UTC data
// into the viewer's browser timezone at query time.
//
// See docs/perf-daily-aggregates.md for the full design.

export const hourlyPromptRuns = pgTable(
	"hourly_prompt_runs",
	{
		brandId: text("brand_id").notNull(),
		promptId: uuid("prompt_id").notNull(),
		hour: timestamp("hour", { withTimezone: true }).notNull(),
		model: text("model").notNull(),
		webSearchEnabled: boolean("web_search_enabled").notNull(),
		totalRuns: integer("total_runs").notNull(),
		brandMentionedCount: integer("brand_mentioned_count").notNull(),
		competitorRunCount: integer("competitor_run_count").notNull(),
		competitorMentionSum: integer("competitor_mention_sum").notNull(),
		firstRunAt: timestamp("first_run_at", { withTimezone: true }).notNull(),
		lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
	},
	(table) => ({
		pk: primaryKey({
			name: "hourly_prompt_runs_pkey",
			columns: [table.brandId, table.hour, table.promptId, table.model, table.webSearchEnabled],
		}),
		brandHourPromptIdx: index("hourly_prompt_runs_brand_hour_prompt_idx").on(table.brandId, table.hour, table.promptId),
		promptHourIdx: index("hourly_prompt_runs_prompt_hour_idx").on(table.promptId, table.hour),
	}),
);

export const hourlyPromptRunCompetitors = pgTable(
	"hourly_prompt_run_competitors",
	{
		brandId: text("brand_id").notNull(),
		promptId: uuid("prompt_id").notNull(),
		hour: timestamp("hour", { withTimezone: true }).notNull(),
		model: text("model").notNull(),
		competitorName: text("competitor_name").notNull(),
		mentionCount: integer("mention_count").notNull(),
	},
	(table) => ({
		pk: primaryKey({
			name: "hourly_prompt_run_competitors_pkey",
			columns: [table.brandId, table.hour, table.promptId, table.model, table.competitorName],
		}),
		brandHourIdx: index("hourly_prompt_run_competitors_brand_hour_idx").on(table.brandId, table.hour),
		promptHourIdx: index("hourly_prompt_run_competitors_prompt_hour_idx").on(table.promptId, table.hour),
	}),
);

export const hourlyCitations = pgTable(
	"hourly_citations",
	{
		brandId: text("brand_id").notNull(),
		promptId: uuid("prompt_id").notNull(),
		hour: timestamp("hour", { withTimezone: true }).notNull(),
		model: text("model").notNull(),
		domain: text("domain").notNull(),
		count: integer("count").notNull(),
	},
	(table) => ({
		pk: primaryKey({
			name: "hourly_citations_pkey",
			columns: [table.brandId, table.hour, table.promptId, table.model, table.domain],
		}),
		brandHourDomainIdx: index("hourly_citations_brand_hour_domain_idx").on(table.brandId, table.hour, table.domain),
		promptHourIdx: index("hourly_citations_prompt_hour_idx").on(table.promptId, table.hour),
	}),
);

export const hourlyCitationUrls = pgTable(
	"hourly_citation_urls",
	{
		brandId: text("brand_id").notNull(),
		promptId: uuid("prompt_id").notNull(),
		hour: timestamp("hour", { withTimezone: true }).notNull(),
		model: text("model").notNull(),
		url: text("url").notNull(),
		domain: text("domain").notNull(),
		title: text("title"),
		count: integer("count").notNull(),
		sumCitationIndex: integer("sum_citation_index").notNull(),
	},
	(table) => ({
		pk: primaryKey({
			name: "hourly_citation_urls_pkey",
			columns: [table.brandId, table.hour, table.promptId, table.model, table.url],
		}),
		brandHourUrlIdx: index("hourly_citation_urls_brand_hour_url_idx").on(table.brandId, table.hour, table.url),
		promptHourIdx: index("hourly_citation_urls_prompt_hour_idx").on(table.promptId, table.hour),
	}),
);

/**
 * Singleton row tracking the worker's progress and the resumable backfill cursor.
 * The worker job `apps/worker/src/jobs/refresh-hourly-aggregates.ts` advances
 * `lastRefreshedThrough` after each successful tick. The backfill script
 * `apps/worker/src/scripts/backfill-hourly-aggregates.ts` advances
 * `backfillCursorBrandId` / `backfillCursorDate` after each completed bucket
 * so that a crashed/interrupted backfill can resume from where it left off.
 */
export const aggregateRefreshState = pgTable("aggregate_refresh_state", {
	id: smallint("id").primaryKey().notNull(),
	lastRefreshedThrough: timestamp("last_refreshed_through", { withTimezone: true })
		.notNull()
		.default(sql`'epoch'::timestamptz`),
	lastRunStartedAt: timestamp("last_run_started_at", { withTimezone: true }),
	lastRunFinishedAt: timestamp("last_run_finished_at", { withTimezone: true }),
	lastRunStatus: text("last_run_status"),
	lastRunError: text("last_run_error"),
	lastAffectedBuckets: integer("last_affected_buckets"),
	backfillStartedAt: timestamp("backfill_started_at", { withTimezone: true }),
	backfillCompletedAt: timestamp("backfill_completed_at", { withTimezone: true }),
	backfillCursorBrandId: text("backfill_cursor_brand_id"),
	backfillCursorDate: date("backfill_cursor_date"),
});

export type HourlyPromptRun = typeof hourlyPromptRuns.$inferSelect;
export type HourlyPromptRunCompetitor = typeof hourlyPromptRunCompetitors.$inferSelect;
export type HourlyCitation = typeof hourlyCitations.$inferSelect;
export type HourlyCitationUrl = typeof hourlyCitationUrls.$inferSelect;
export type AggregateRefreshState = typeof aggregateRefreshState.$inferSelect;
