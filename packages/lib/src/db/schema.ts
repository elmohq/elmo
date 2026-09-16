import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	index,
	integer,
	json,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
// `organization` is referenced by the brands FK below; the re-export makes it
// (and the rest of the auth schema) visible to `import * as schema` consumers.
import { organization } from "./schema-auth";

// Better-auth tables & relations — re-exported so `import * as schema` sees everything.
// Source file is auto-generated; run `pnpm run generate:auth-schema` to refresh.
export * from "./schema-auth";

// ============================================================================
// Application tables
// ============================================================================

export const reportStatusEnum = pgEnum("report_status", ["pending", "processing", "completed", "failed"]);

export const brands = pgTable(
	"brands",
	{
		id: text("id").primaryKey().notNull(),
		name: text("name").notNull(),
		slug: text("slug"),
		website: text("website").notNull(),
		additionalDomains: text("additional_domains").array().notNull().default([]),
		aliases: text("aliases").array().notNull().default([]),
		enabled: boolean("enabled").default(true).notNull(),
		onboarded: boolean("onboarded").default(false).notNull(),
		delayOverrideHours: integer("delay_override_hours"),
		enabledModels: text("enabled_models").array(),
		// Hard tenancy scope. Every brand belongs to exactly one better-auth
		// organization; org membership (the `member` table) is the access-control
		// mechanism. Brand and organization ids are independent, so billing and
		// entitlement joins must use this key.
		organizationId: text("organization_id")
			.references(() => organization.id)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		organizationIdIdx: index("brands_organization_id_idx").on(table.organizationId),
		// Postgres treats nulls as distinct here, which is what lets every
		// un-slugged brand in an organization coexist. NULLS NOT DISTINCT would
		// allow only one.
		organizationSlugIdx: uniqueIndex("brands_organization_id_slug_idx").on(table.organizationId, table.slug),
	}),
).enableRLS();

export const prompts = pgTable(
	"prompts",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		value: text("value").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		/**
		 * Premium models this prompt is tracked on, grounded: one org premium slot
		 * per entry (see PREMIUM_MODELS). Empty = standard tracking only.
		 */
		premiumModels: text("premium_models").array().notNull().default([]),
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
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		model: text("model").notNull(),
		provider: text("provider"),
		version: text("version").notNull(),
		webSearchEnabled: boolean("web_search_enabled").notNull(),
		rawOutput: json("raw_output").notNull(),
		webQueries: text("web_queries").array().notNull().default([]),
		brandMentioned: boolean("brand_mentioned").notNull(),
		competitorsMentioned: text("competitors_mentioned").array().notNull().default([]),
		/** Answer text extracted from `raw_output`; null until the run is extracted. */
		textContent: text("text_content"),
		extractorVersion: integer("extractor_version"),
		/** Deriver name -> the version stamp of the code and brand config that produced its columns. */
		analysisVersions: jsonb("analysis_versions").$type<Record<string, string>>().notNull().default({}),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		promptIdCreatedAtIdx: index("prompt_runs_prompt_id_created_at_idx").on(table.promptId, table.createdAt),
		createdAtIdx: index("prompt_runs_created_at_idx").on(table.createdAt),
		webSearchCreatedAtIdx: index("prompt_runs_web_search_created_at_idx").on(table.webSearchEnabled, table.createdAt),
		webSearchModelCreatedAtIdx: index("prompt_runs_web_search_model_created_at_idx").on(
			table.webSearchEnabled,
			table.model,
			table.createdAt,
		),
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
		brandAnalyticsIdx: index("citations_brand_created_analytics_idx").on(
			table.brandId,
			table.createdAt,
			table.url,
			table.domain,
			table.title,
			table.promptId,
			table.model,
			table.citationIndex,
		),
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

// One row per generated Opportunities report, per brand — append-only history
// (every generation is kept, not overwritten). The page reads the latest row and
// regenerates only when it's stale; see apps/web/src/server/opportunities.ts.
export const brandOpportunities = pgTable(
	"brand_opportunities",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		/** The full enriched opportunities report the page renders (OpportunitiesReport JSON). */
		report: json("report").notNull(),
		/** Model/provider that generated it, when known. */
		model: text("model"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		brandCreatedIdx: index("brand_opportunities_brand_id_created_at_idx").on(table.brandId, table.createdAt),
	}),
).enableRLS();

export type BrandOpportunity = typeof brandOpportunities.$inferSelect;
export type NewBrandOpportunity = typeof brandOpportunities.$inferInsert;

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

/**
 * Cloud billing/entitlement state we own per organization (as opposed to the
 * better-auth-managed `subscription` table). One optional row per org:
 * - entitlementOverrides: sparse custom-plan overrides (see
 *   entitlementOverridesSchema in @workspace/config/entitlements) — the
 *   config-only lever for custom plans
 * - premiumAddonQuantity: purchased extra premium slots, synced from Stripe
 *   subscription items by the billing webhook
 * Absent row = no overrides, no add-on. Unused outside cloud.
 */
export const organizationSettings = pgTable("organization_settings", {
	organizationId: text("organization_id")
		.primaryKey()
		.notNull()
		.references(() => organization.id),
	entitlementOverrides: jsonb("entitlement_overrides"),
	premiumAddonQuantity: integer("premium_addon_quantity").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}).enableRLS();

export type OrganizationSettings = typeof organizationSettings.$inferSelect;

/**
 * Billing-grade usage attribution: one row per provider call the
 * worker makes, so every run is attributable to an org with an estimated
 * cost. Written in every mode (self-hosted operators get the same spend
 * visibility); estimated costs come from the tunable table in
 * src/usage/cost.ts and are validated against provider invoices, not treated
 * as ground truth.
 */
export const usageEvents = pgTable(
	"usage_events",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		brandId: text("brand_id").notNull(),
		promptId: uuid("prompt_id"),
		eventType: text("event_type").notNull(),
		provider: text("provider"),
		model: text("model"),
		webSearchEnabled: boolean("web_search_enabled").notNull().default(false),
		units: integer("units").notNull().default(1),
		estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		orgCreatedIdx: index("usage_events_org_created_idx").on(table.organizationId, table.createdAt),
	}),
).enableRLS();

export type UsageEvent = typeof usageEvents.$inferSelect;

// Encrypted overrides for credential environment variables, keyed by the env-var
// name they stand in for. Separate table, strictest access.
export const secrets = pgTable("secrets", {
	name: text("name").primaryKey().notNull(),
	encryptedValue: text("encrypted_value").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}).enableRLS();

// ============================================================================
// Analytics rollups
// ============================================================================

/**
 * The grain every rollup table shares: one brand's prompt, evaluated against one
 * (model, provider, grounded) target, inside one 30-minute UTC bucket.
 *
 * A function rather than a shared object so each table gets its own column
 * builders. `provider` is stored as '' rather than null because null key parts
 * never compare equal, which would let a bucket rebuild insert duplicates.
 *
 * No foreign keys to brands or prompts: a rebuild deletes and reinserts a range,
 * and prompt deletion removes these rows explicitly.
 */
const rollupKeyColumns = () => ({
	brandId: text("brand_id").notNull(),
	bucket: timestamp("bucket", { withTimezone: true }).notNull(),
	promptId: uuid("prompt_id").notNull(),
	model: text("model").notNull(),
	provider: text("provider").notNull().default(""),
	webSearchEnabled: boolean("web_search_enabled").notNull(),
});

export const rollupPromptRuns = pgTable(
	"rollup_prompt_runs",
	{
		...rollupKeyColumns(),
		runs: integer("runs").notNull(),
		brandMentionedRuns: integer("brand_mentioned_runs").notNull(),
		/** Runs mentioning at least one competitor. */
		competitorRuns: integer("competitor_runs").notNull(),
		/** Total competitor mentions across the bucket's runs. */
		competitorMentions: integer("competitor_mentions").notNull(),
		firstRunAt: timestamp("first_run_at", { withTimezone: true }).notNull(),
		lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		primaryKey({
			name: "rollup_prompt_runs_pk",
			columns: [table.brandId, table.bucket, table.promptId, table.model, table.provider, table.webSearchEnabled],
		}),
		index("rollup_prompt_runs_prompt_id_bucket_idx").on(table.promptId, table.bucket),
	],
).enableRLS();

export const rollupCompetitorMentions = pgTable(
	"rollup_competitor_mentions",
	{
		...rollupKeyColumns(),
		/** Keyed by name, not competitor id: a bulk competitor save reinserts rows with new ids. */
		competitorName: text("competitor_name").notNull(),
		runs: integer("runs").notNull(),
	},
	(table) => [
		primaryKey({
			name: "rollup_competitor_mentions_pk",
			columns: [
				table.brandId,
				table.bucket,
				table.promptId,
				table.model,
				table.provider,
				table.webSearchEnabled,
				table.competitorName,
			],
		}),
		index("rollup_competitor_mentions_prompt_id_bucket_idx").on(table.promptId, table.bucket),
	],
).enableRLS();

/**
 * One row per distinct normalized URL, shared by every tenant. Classification
 * here is the tenant-independent half; brand and competitor domains are applied
 * at read time.
 */
export const citedPages = pgTable(
	"cited_pages",
	{
		id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey().notNull(),
		url: text("url").notNull().unique(),
		domain: text("domain").notNull(),
		/** Most recently seen non-null title. */
		title: text("title"),
		pageType: text("page_type").notNull(),
		staticCategory: text("static_category").notNull(),
		classifierVersion: integer("classifier_version").notNull(),
		firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
	},
	(table) => [index("cited_pages_domain_idx").on(table.domain)],
).enableRLS();

export const rollupCitationUrls = pgTable(
	"rollup_citation_urls",
	{
		...rollupKeyColumns(),
		pageId: bigint("page_id", { mode: "number" })
			.notNull()
			.references(() => citedPages.id),
		/** Denormalized from cited_pages so domain and category reads need no join. */
		domain: text("domain").notNull(),
		staticCategory: text("static_category").notNull(),
		pageType: text("page_type").notNull(),
		citations: integer("citations").notNull(),
		/** Sum and count are kept apart so citations without a position do not skew the mean. */
		positionSum: integer("position_sum").notNull(),
		positionCount: integer("position_count").notNull(),
	},
	(table) => [
		primaryKey({
			name: "rollup_citation_urls_pk",
			columns: [
				table.brandId,
				table.bucket,
				table.promptId,
				table.model,
				table.provider,
				table.webSearchEnabled,
				table.pageId,
			],
		}),
		index("rollup_citation_urls_prompt_id_bucket_idx").on(table.promptId, table.bucket),
	],
).enableRLS();

export const rollupCitationDomains = pgTable(
	"rollup_citation_domains",
	{
		...rollupKeyColumns(),
		domain: text("domain").notNull(),
		staticCategory: text("static_category").notNull(),
		citations: integer("citations").notNull(),
	},
	(table) => [
		primaryKey({
			name: "rollup_citation_domains_pk",
			columns: [
				table.brandId,
				table.bucket,
				table.promptId,
				table.model,
				table.provider,
				table.webSearchEnabled,
				table.domain,
			],
		}),
		index("rollup_citation_domains_prompt_id_bucket_idx").on(table.promptId, table.bucket),
	],
).enableRLS();

/**
 * Invalidation outbox. Whoever changes raw data or interpretation marks the
 * affected buckets in the same transaction; the refresh job claims marks before
 * it reads, so a writer that commits mid-rebuild leaves its own mark behind.
 */
export const rollupDirty = pgTable(
	"rollup_dirty",
	{
		brandId: text("brand_id").notNull(),
		bucket: timestamp("bucket", { withTimezone: true }).notNull(),
		reason: text("reason").notNull(),
		markedAt: timestamp("marked_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ name: "rollup_dirty_pk", columns: [table.brandId, table.bucket] }),
		index("rollup_dirty_bucket_idx").on(table.bucket),
	],
).enableRLS();

/**
 * Single row recording which code versions the stored derived data reflects.
 * The worker compares it to the constants in lib on startup and enqueues the
 * work that closes the gap.
 */
export const pipelineState = pgTable(
	"pipeline_state",
	{
		id: smallint("id").primaryKey().default(1),
		backfillEnqueuedAt: timestamp("backfill_enqueued_at", { withTimezone: true }),
		backfillCompletedAt: timestamp("backfill_completed_at", { withTimezone: true }),
		rollupVersion: integer("rollup_version").notNull().default(0),
		classifierVersion: integer("classifier_version").notNull().default(0),
		extractorVersion: integer("extractor_version").notNull().default(0),
		/** Deriver name -> the version of that deriver the stored columns reflect. */
		deriverVersions: jsonb("deriver_versions").$type<Record<string, number>>().notNull().default({}),
		lastReconcileAt: timestamp("last_reconcile_at", { withTimezone: true }),
	},
	() => [check("pipeline_state_singleton", sql`id = 1`)],
).enableRLS();

export type RollupPromptRun = typeof rollupPromptRuns.$inferSelect;
export type NewRollupPromptRun = typeof rollupPromptRuns.$inferInsert;

export type RollupCompetitorMention = typeof rollupCompetitorMentions.$inferSelect;
export type NewRollupCompetitorMention = typeof rollupCompetitorMentions.$inferInsert;

export type CitedPage = typeof citedPages.$inferSelect;
export type NewCitedPage = typeof citedPages.$inferInsert;

export type RollupCitationUrl = typeof rollupCitationUrls.$inferSelect;
export type NewRollupCitationUrl = typeof rollupCitationUrls.$inferInsert;

export type RollupCitationDomain = typeof rollupCitationDomains.$inferSelect;
export type NewRollupCitationDomain = typeof rollupCitationDomains.$inferInsert;

export type RollupDirty = typeof rollupDirty.$inferSelect;
export type NewRollupDirty = typeof rollupDirty.$inferInsert;

export type PipelineState = typeof pipelineState.$inferSelect;
