import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	json,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
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

/**
 * A competitor's id is its identity for the whole life of the brand: historical
 * mentions and analytics key on it, so removing a competitor never deletes the
 * row. `active` is what every "currently tracked" surface filters on;
 * `previous_names` keeps the names a competitor was known by so historical
 * mention records written under an old name can still be attributed safely.
 */
export const competitors = pgTable(
	"competitors",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		name: text("name").notNull(),
		domains: text("domains").array().notNull().default([]),
		aliases: text("aliases").array().notNull().default([]),
		previousNames: text("previous_names").array().notNull().default([]),
		active: boolean("active").default(true).notNull(),
		removedAt: timestamp("removed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		brandIdActiveIdx: index("competitors_brand_id_active_idx").on(table.brandId, table.active),
	}),
).enableRLS();

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

/**
 * A brand as the app shell and dashboards see it. Prompts travel as a count,
 * never as rows: a brand may hold ten thousand of them and the pages that
 * take this only ask whether there are any.
 */
export type BrandWithPrompts = Brand & {
	promptCount: number;
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

/**
 * Supplemental LLM classification of source hostnames whose built-in
 * domain-level category is "other" — a global cache keyed by the normalized
 * exact hostname (not the registrable root: different subdomains can play
 * different roles). Global because it describes the source itself, not a
 * brand's view of it; brand/competitor context still overrides it at read
 * time. One current row per hostname: a `classifier_version` mismatch means
 * the row is stale and the hostname is eligible for reclassification, which
 * replaces the row through the normal upsert path. A valid `other` row is
 * kept deliberately — it suppresses repeated LLM calls for hostnames the
 * classifier could not place.
 */
export const sourceDomainClassifications = pgTable(
	"source_domain_classifications",
	{
		hostname: text("hostname").primaryKey().notNull(),
		category: text("category").notNull(),
		confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
		reason: text("reason").notNull(),
		provider: text("provider").notNull(),
		model: text("model"),
		classifierVersion: text("classifier_version").notNull(),
		classifiedAt: timestamp("classified_at", { withTimezone: true }).defaultNow().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		categoryCheck: check(
			"source_domain_classifications_category_check",
			sql`${table.category} IN ('editorial', 'reviews', 'ecommerce', 'social', 'developer', 'pr', 'reference', 'institutional', 'other')`,
		),
		confidenceCheck: check(
			"source_domain_classifications_confidence_check",
			sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
		),
	}),
).enableRLS();

export type SourceDomainClassificationRecord = typeof sourceDomainClassifications.$inferSelect;
export type NewSourceDomainClassificationRecord = typeof sourceDomainClassifications.$inferInsert;

// ============================================================================
// Sentiment (SENT-01)
// ============================================================================
//
// Everything below hangs off a prompt run and is deleted with it (ON DELETE
// CASCADE), so the existing prompt/run deletion sequence — including the one
// an older application image executes — never trips over sentiment rows.
// Competitor references stay restrictive: a competitor with sentiment history
// cannot be hard-deleted (its identity is permanent since SENT-R0).

/**
 * Run-level receipt that a versioned detector scanned this run. This — not
 * the presence of mention rows — is what says whether a run was visited:
 * `mentions` and `no_mentions` are completed scans of an extractable answer,
 * `unextractable` records that the stored output had no answer text. A run
 * without a current-version receipt has not been scanned.
 */
export const sentimentDetections = pgTable(
	"sentiment_detections",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		promptRunId: uuid("prompt_run_id")
			.references(() => promptRuns.id, { onDelete: "cascade" })
			.notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		detectorVersion: text("detector_version").notNull(),
		status: text("status").notNull(),
		mentionCount: integer("mention_count").notNull().default(0),
		detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		runVersionUnique: uniqueIndex("sentiment_detections_run_version_idx").on(table.promptRunId, table.detectorVersion),
		brandVersionStatusIdx: index("sentiment_detections_brand_version_status_idx").on(
			table.brandId,
			table.detectorVersion,
			table.status,
		),
		statusCheck: check(
			"sentiment_detections_status_check",
			sql`${table.status} IN ('mentions', 'no_mentions', 'unextractable')`,
		),
		mentionCountCheck: check(
			"sentiment_detections_mention_count_check",
			sql`${table.mentionCount} >= 0 AND ((${table.status} = 'mentions') = (${table.mentionCount} > 0))`,
		),
	}),
).enableRLS();

/**
 * Deterministic entity mentions: one row per stored prompt run and entity
 * (own brand or a competitor by id) found in the answer body by a versioned
 * detector. This — not `prompt_runs.competitors_mentioned`, which stores
 * names and is kept for the older pages — is the stable mention denominator
 * for sentiment. `entity_key` is `brand` or the competitor uuid so the
 * uniqueness holds although `competitor_id` is nullable.
 *
 * Lifecycle: a row is *current* while `superseded_at` is null and its
 * detector version is the current one. When a newer detector pass no longer
 * finds the entity, a row that observations still reference is superseded
 * (kept for the audit trail, invisible to the current projection) instead of
 * deleted; a later pass that finds the entity again reactivates the same row.
 */
export const promptRunEntityMentions = pgTable(
	"prompt_run_entity_mentions",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		promptRunId: uuid("prompt_run_id")
			.references(() => promptRuns.id, { onDelete: "cascade" })
			.notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		entityType: text("entity_type").notNull(),
		competitorId: uuid("competitor_id").references(() => competitors.id),
		entityKey: text("entity_key").notNull(),
		entityName: text("entity_name").notNull(),
		detectorVersion: text("detector_version").notNull(),
		matchedTerms: text("matched_terms").array().notNull().default([]),
		detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
		supersededAt: timestamp("superseded_at", { withTimezone: true }),
	},
	(table) => ({
		runEntityUnique: uniqueIndex("prompt_run_entity_mentions_run_entity_idx").on(table.promptRunId, table.entityKey),
		brandEntityIdx: index("prompt_run_entity_mentions_brand_entity_idx").on(table.brandId, table.entityKey),
		entityTypeCheck: check(
			"prompt_run_entity_mentions_entity_type_check",
			sql`${table.entityType} IN ('brand', 'competitor')`,
		),
		entityIdentityCheck: check(
			"prompt_run_entity_mentions_entity_identity_check",
			sql`(${table.entityType} = 'brand' AND ${table.competitorId} IS NULL AND ${table.entityKey} = 'brand') OR (${table.entityType} = 'competitor' AND ${table.competitorId} IS NOT NULL AND ${table.entityKey} = ${table.competitorId}::text)`,
		),
	}),
).enableRLS();

/**
 * One classifier pass over one prompt run for one classifier version. The
 * lifecycle is what makes retries and the backfill idempotent: a row is
 * created `pending` when the job is queued, is claimed `processing` by
 * exactly one worker (a conditional update on the status), and ends
 * `completed`, `no_mentions` (no provider call was needed) or `failed`.
 * `input_hash` is the canonical classifier input the completed result
 * belongs to; a mismatch means the run is eligible again. `claim_generation`
 * increments on every successful claim and fences every later write: a
 * claimant may only complete, fail or replace observations while its
 * generation is still the row's, so an attempt that outlived its lease can
 * never overwrite a newer attempt. Provider/model are attempt attribution and
 * audit metadata only and are never shown on the page.
 */
export const sentimentAnalyses = pgTable(
	"sentiment_analyses",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		promptRunId: uuid("prompt_run_id")
			.references(() => promptRuns.id, { onDelete: "cascade" })
			.notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		classifierVersion: text("classifier_version").notNull(),
		taxonomyVersion: text("taxonomy_version").notNull(),
		inputHash: text("input_hash"),
		status: text("status").notNull().default("pending"),
		provider: text("provider"),
		model: text("model"),
		webSearch: boolean("web_search"),
		errorCode: text("error_code"),
		errorMessage: text("error_message"),
		attempts: integer("attempts").notNull().default(0),
		claimGeneration: integer("claim_generation").notNull().default(0),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		/**
		 * Set together with `completed` since classifier v5: which independent
		 * verification (the semantic verifier version or a human adjudication)
		 * accepted the persisted result. A completed v5 row without it is never
		 * read.
		 */
		verifierVersion: text("verifier_version"),
		verifiedAt: timestamp("verified_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		runVersionUnique: uniqueIndex("sentiment_analyses_run_version_idx").on(table.promptRunId, table.classifierVersion),
		brandStatusIdx: index("sentiment_analyses_brand_status_idx").on(
			table.brandId,
			table.classifierVersion,
			table.status,
		),
		statusCheck: check(
			"sentiment_analyses_status_check",
			sql`${table.status} IN ('pending', 'processing', 'completed', 'no_mentions', 'failed', 'pending_resolution')`,
		),
	}),
).enableRLS();

/**
 * Entity-level sentiment for one mention within one analysis. Score and
 * category are stored together and cross-checked so an inconsistent pair can
 * never be persisted: Positive 51–100, Negative 0–49, Neutral and Mixed
 * exactly 50. Evidence is a bounded list of exact excerpts of the stored
 * answer with raw-body offsets and a polarity per excerpt.
 */
export const sentimentObservations = pgTable(
	"sentiment_observations",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		analysisId: uuid("analysis_id")
			.references(() => sentimentAnalyses.id, { onDelete: "cascade" })
			.notNull(),
		mentionId: uuid("mention_id")
			.references(() => promptRunEntityMentions.id, { onDelete: "cascade" })
			.notNull(),
		promptRunId: uuid("prompt_run_id")
			.references(() => promptRuns.id, { onDelete: "cascade" })
			.notNull(),
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		entityType: text("entity_type").notNull(),
		competitorId: uuid("competitor_id").references(() => competitors.id),
		entityKey: text("entity_key").notNull(),
		score: smallint("score").notNull(),
		category: text("category").notNull(),
		confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
		evidence: jsonb("evidence").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		analysisEntityUnique: uniqueIndex("sentiment_observations_analysis_entity_idx").on(
			table.analysisId,
			table.entityKey,
		),
		brandEntityRunIdx: index("sentiment_observations_brand_entity_run_idx").on(
			table.brandId,
			table.entityKey,
			table.promptRunId,
		),
		brandEntityScoreIdx: index("sentiment_observations_brand_entity_score_idx").on(
			table.brandId,
			table.entityKey,
			table.score,
		),
		scoreCheck: check("sentiment_observations_score_check", sql`${table.score} >= 0 AND ${table.score} <= 100`),
		categoryCheck: check(
			"sentiment_observations_category_check",
			sql`(${table.category} = 'positive' AND ${table.score} >= 51) OR (${table.category} = 'negative' AND ${table.score} <= 49) OR (${table.category} IN ('neutral', 'mixed') AND ${table.score} = 50)`,
		),
		confidenceCheck: check(
			"sentiment_observations_confidence_check",
			sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
		),
		entityIdentityCheck: check(
			"sentiment_observations_entity_identity_check",
			sql`(${table.entityType} = 'brand' AND ${table.competitorId} IS NULL AND ${table.entityKey} = 'brand') OR (${table.entityType} = 'competitor' AND ${table.competitorId} IS NOT NULL AND ${table.entityKey} = ${table.competitorId}::text)`,
		),
	}),
).enableRLS();

/**
 * Aspect-level sentiment (price, coverage, service, other) under one entity
 * observation, keyed by the versioned taxonomy so a later taxonomy cannot
 * silently rewrite what an older row meant.
 */
export const sentimentAspectObservations = pgTable(
	"sentiment_aspect_observations",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		observationId: uuid("observation_id")
			.references(() => sentimentObservations.id, { onDelete: "cascade" })
			.notNull(),
		taxonomyVersion: text("taxonomy_version").notNull(),
		aspectKey: text("aspect_key").notNull(),
		aspectLabel: text("aspect_label").notNull(),
		score: smallint("score").notNull(),
		category: text("category").notNull(),
		confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
		evidence: jsonb("evidence").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		observationAspectUnique: uniqueIndex("sentiment_aspect_observations_observation_aspect_idx").on(
			table.observationId,
			table.taxonomyVersion,
			table.aspectKey,
		),
		aspectScoreIdx: index("sentiment_aspect_observations_aspect_score_idx").on(
			table.taxonomyVersion,
			table.aspectKey,
			table.score,
		),
		aspectKeyCheck: check(
			"sentiment_aspect_observations_aspect_key_check",
			sql`${table.aspectKey} IN ('price', 'coverage', 'service', 'other')`,
		),
		scoreCheck: check("sentiment_aspect_observations_score_check", sql`${table.score} >= 0 AND ${table.score} <= 100`),
		categoryCheck: check(
			"sentiment_aspect_observations_category_check",
			sql`(${table.category} = 'positive' AND ${table.score} >= 51) OR (${table.category} = 'negative' AND ${table.score} <= 49) OR (${table.category} IN ('neutral', 'mixed') AND ${table.score} = 50)`,
		),
		confidenceCheck: check(
			"sentiment_aspect_observations_confidence_check",
			sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
		),
	}),
).enableRLS();

/**
 * Operator audit of aspect claims the classifier proposed and the answer did
 * not support for that entity (classifier v5): the claim is dropped from the
 * analysis, which completes on the grounded claims, and this row records that
 * it was proposed. Identifiers and the allow-listed validation code only —
 * no text of the answer, the prompt or the provider payload ever lands here.
 * Internal: the Sentiment page never reads it. At most one row per
 * (analysis, entity, aspect) — an aspect is dropped for one reason — enforced
 * by the database; rows are replaced with the observations of their analysis.
 */
export const sentimentFilteredClaims = pgTable(
	"sentiment_filtered_claims",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		analysisId: uuid("analysis_id")
			.references(() => sentimentAnalyses.id, { onDelete: "cascade" })
			.notNull(),
		entityType: text("entity_type").notNull(),
		entityKey: text("entity_key").notNull(),
		aspectKey: text("aspect_key").notNull(),
		validationCode: text("validation_code").notNull(),
		classifierVersion: text("classifier_version").notNull(),
		/** Anchor ids (`s0001`…) the dropped claim cited; never the anchor text. */
		anchorIds: jsonb("anchor_ids").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		analysisAspectUnique: uniqueIndex("sentiment_filtered_claims_analysis_aspect_idx").on(
			table.analysisId,
			table.entityKey,
			table.aspectKey,
		),
		aspectKeyCheck: check(
			"sentiment_filtered_claims_aspect_key_check",
			sql`${table.aspectKey} IN ('price', 'coverage', 'service', 'other')`,
		),
		entityTypeCheck: check(
			"sentiment_filtered_claims_entity_type_check",
			sql`${table.entityType} IN ('brand', 'competitor')`,
		),
		validationCodeCheck: check(
			"sentiment_filtered_claims_validation_code_check",
			sql`${table.validationCode} IN ('aspect-ungrounded', 'evidence-entity-unbound', 'polarity-category-mismatch', 'mixed-needs-dual-evidence', 'evidence-anchor-polarity-conflict', 'verifier:entity-misattribution', 'verifier:polarity-mismatch', 'verifier:category-mismatch', 'verifier:mixed-semantics', 'verifier:aspect-misrouted', 'verifier:unsupported-evaluation')`,
		),
	}),
).enableRLS();

/**
 * Durable resolution state of one v5 analysis while it is not yet verified
 * (ADR-SENT-01-GROUNDED-COMPLETION, Amendment B): where the run is in the
 * classify → assess → repair → verify workflow, what the provisional candidate
 * looks like (entity keys, scores, categories, anchor ids and polarities —
 * never text), which targets are unresolved, and the bounded automatic
 * budget already spent. `awaiting_review` and `awaiting_reconciliation` are
 * mandatory operator work items, never a closed failure; `resolved` is set in
 * the same transaction that persists the verified result. `instance_id`
 * identifies one resolution instance (analysis = run + classifier version,
 * plus the input hash): a resolved instance is immutable, and a changed input
 * rotates the id with a fresh budget while the old instance's attempt rows
 * stay under the old id.
 */
export const sentimentResolutionCases = pgTable(
	"sentiment_resolution_cases",
	{
		analysisId: uuid("analysis_id")
			.primaryKey()
			.references(() => sentimentAnalyses.id, { onDelete: "cascade" })
			.notNull(),
		instanceId: uuid("instance_id").defaultRandom().notNull(),
		inputHash: text("input_hash").notNull(),
		status: text("status").notNull().default("open"),
		provisionalResult: jsonb("provisional_result"),
		unresolvedTargets: jsonb("unresolved_targets").notNull().default(sql`'[]'::jsonb`),
		automatedProviderCalls: integer("automated_provider_calls").notNull().default(0),
		totalActualCostUsd: numeric("total_actual_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
		nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
		/** Allow-listed reason a case left the automatic workflow (policy limit, contract defect, unknown provider outcome). */
		reviewReason: text("review_reason"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		statusIdx: index("sentiment_resolution_cases_status_idx").on(table.status, table.nextAttemptAt),
		statusCheck: check(
			"sentiment_resolution_cases_status_check",
			sql`${table.status} IN ('open', 'repairing', 'verifying', 'retry_wait', 'awaiting_review', 'awaiting_reconciliation', 'resolved')`,
		),
		callsCheck: check("sentiment_resolution_cases_calls_check", sql`${table.automatedProviderCalls} >= 0`),
		costCheck: check("sentiment_resolution_cases_cost_check", sql`${table.totalActualCostUsd} >= 0`),
		reviewReasonCheck: check(
			"sentiment_resolution_cases_review_reason_check",
			sql`${table.reviewReason} IS NULL OR ${table.reviewReason} IN ('call-limit', 'cost-limit', 'contract-defect', 'unknown-provider-outcome', 'initial-classification-limit', 'retry-exhausted', 'verifier-rejected')`,
		),
	}),
).enableRLS();

/**
 * Ledger of every provider request a v5 analysis makes, written as an intent
 * before the request leaves and finished with the safe outcome: the phase, the
 * opaque generation id when an answer arrived (unique — one paid answer is one
 * row), the input hash the request was built for and the charged cost. A row
 * left in `sending` means the outcome is unknown and blocks automatic calls
 * until reconciled. No request or response text ever lands here.
 */
export const sentimentProviderAttempts = pgTable(
	"sentiment_provider_attempts",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		analysisId: uuid("analysis_id")
			.references(() => sentimentAnalyses.id, { onDelete: "cascade" })
			.notNull(),
		/** The resolution instance the request was made for; the ordinal runs over the whole analysis and is never reused. */
		instanceId: uuid("instance_id").notNull(),
		ordinal: integer("ordinal").notNull(),
		phase: text("phase").notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		generationId: text("generation_id"),
		inputHash: text("input_hash").notNull(),
		outcome: text("outcome").notNull().default("sending"),
		actualCostUsd: numeric("actual_cost_usd", { precision: 10, scale: 6 }),
		/**
		 * The normalized, schema-valid candidate this answered attempt produced
		 * (entity keys, scores, categories, anchor ids, polarities — never text),
		 * owned by the attempt so a worker that lost its claim still leaves a
		 * reusable result behind. Null for unanswered attempts and for verdicts.
		 */
		candidate: jsonb("candidate"),
		/** The dispatch permit that authorized this request while dispatch was held; null under open dispatch. */
		permitId: uuid("permit_id").references(() => sentimentDispatchPermits.id),
		/** `rp1:` request-profile scope and `sfp1:` schema-shape fingerprint of the exact document sent. */
		scopeKey: text("scope_key"),
		schemaFp: text("schema_fp"),
		/** Planning estimate reserved against the permit before dispatch; released or replaced by the settled cost. */
		reservedEstimateUsd: numeric("reserved_estimate_usd", { precision: 10, scale: 6 }),
		startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	(table) => ({
		candidateCheck: check(
			"sentiment_provider_attempts_candidate_check",
			sql`${table.candidate} IS NULL OR jsonb_typeof(${table.candidate}) = 'object'`,
		),
		analysisOrdinalUnique: uniqueIndex("sentiment_provider_attempts_analysis_ordinal_idx").on(
			table.analysisId,
			table.ordinal,
		),
		generationUnique: uniqueIndex("sentiment_provider_attempts_generation_idx").on(table.generationId),
		phaseCheck: check(
			"sentiment_provider_attempts_phase_check",
			sql`${table.phase} IN ('classify', 'repair', 'verify')`,
		),
		outcomeCheck: check(
			"sentiment_provider_attempts_outcome_check",
			sql`${table.outcome} IN ('sending', 'accepted', 'rejected', 'provider-error', 'aborted')`,
		),
		ordinalCheck: check("sentiment_provider_attempts_ordinal_check", sql`${table.ordinal} >= 1`),
		costCheck: check(
			"sentiment_provider_attempts_cost_check",
			sql`${table.actualCostUsd} IS NULL OR ${table.actualCostUsd} >= 0`,
		),
		generationCheck: check(
			"sentiment_provider_attempts_generation_check",
			sql`${table.generationId} IS NULL OR ${table.generationId} ~ '^[A-Za-z0-9_-]{1,64}$'`,
		),
	}),
).enableRLS();

// ============================================================================
// Sentiment dispatch safety controls (ADR-SENT-01-GROUNDED-COMPLETION, Amendment C)
// ============================================================================

/**
 * One row per control; `dispatch` gates every v5 sentiment provider request.
 * Readers treat an absent or unreadable row as `held`. Transitions are
 * compare-and-swap on `state` and bump `epoch`; every transition also appends
 * a `sentiment_control_events` row.
 */
export const sentimentControls = pgTable(
	"sentiment_controls",
	{
		key: text("key").primaryKey().notNull(),
		state: text("state").notNull(),
		epoch: integer("epoch").notNull(),
		changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
		actor: text("actor").notNull(),
		reason: text("reason").notNull(),
		correlationId: text("correlation_id").notNull(),
	},
	(table) => ({
		stateCheck: check("sentiment_controls_state_check", sql`${table.state} IN ('held', 'open')`),
		epochCheck: check("sentiment_controls_epoch_check", sql`${table.epoch} >= 1`),
	}),
).enableRLS();

/** Append-only audit of control, permit and breaker transitions; `seq` is dense per subject and never rewritten. */
export const sentimentControlEvents = pgTable(
	"sentiment_control_events",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		subjectKind: text("subject_kind").notNull(),
		subjectKey: text("subject_key").notNull(),
		seq: integer("seq").notNull(),
		fromState: text("from_state"),
		toState: text("to_state").notNull(),
		actor: text("actor").notNull(),
		reason: text("reason").notNull(),
		correlationId: text("correlation_id").notNull(),
		/** Identifiers, codes and counts only — never prompts, answers, schema documents or credentials. */
		evidence: jsonb("evidence"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		subjectSeqUnique: uniqueIndex("sentiment_control_events_subject_seq_idx").on(
			table.subjectKind,
			table.subjectKey,
			table.seq,
		),
		kindCheck: check(
			"sentiment_control_events_kind_check",
			sql`${table.subjectKind} IN ('control', 'permit', 'breaker', 'alert')`,
		),
		seqCheck: check("sentiment_control_events_seq_check", sql`${table.seq} >= 1`),
	}),
).enableRLS();

/**
 * The only bypass of a held dispatch: one lifecycle of one analysis instance
 * for one exact input, with a per-phase call budget in {0,1}, a DB-clock
 * expiry and an estimated cost budget. The estimate is a planning figure —
 * the enforceable limits are the phases, the calls, the request token/tool
 * limits, the expiry and the fencing; actual cost is known only after settlement.
 */
export const sentimentDispatchPermits = pgTable(
	"sentiment_dispatch_permits",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		purpose: text("purpose").notNull(),
		promptRunId: uuid("prompt_run_id").notNull(),
		analysisId: uuid("analysis_id")
			.references(() => sentimentAnalyses.id, { onDelete: "cascade" })
			.notNull(),
		instanceId: uuid("instance_id").notNull(),
		inputHash: text("input_hash").notNull(),
		classifierVersion: text("classifier_version").notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		/** Remaining calls per phase, e.g. {"classify":1,"repair":1,"verify":1}; consumed atomically per dispatch. */
		phaseBudget: jsonb("phase_budget").notNull(),
		estimatedCostBudgetUsd: numeric("estimated_cost_budget_usd", { precision: 10, scale: 6 }).notNull(),
		settledCostUsd: numeric("settled_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
		reservedEstimateUsd: numeric("reserved_estimate_usd", { precision: 10, scale: 6 }).notNull().default("0"),
		state: text("state").notNull().default("issued"),
		issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		issuedBy: text("issued_by").notNull(),
		reason: text("reason").notNull(),
		correlationId: text("correlation_id").notNull(),
		contractSha256: text("contract_sha256"),
	},
	(table) => ({
		liveUnique: uniqueIndex("sentiment_dispatch_permits_live_idx")
			.on(table.analysisId, table.instanceId)
			.where(sql`${table.state} IN ('issued', 'active')`),
		analysisIdx: index("sentiment_dispatch_permits_analysis_idx").on(table.analysisId, table.state),
		purposeCheck: check(
			"sentiment_dispatch_permits_purpose_check",
			sql`${table.purpose} IN ('canary', 'resume-verify', 'resume-repair')`,
		),
		stateCheck: check(
			"sentiment_dispatch_permits_state_check",
			sql`${table.state} IN ('issued', 'active', 'exhausted', 'expired', 'revoked')`,
		),
		budgetCheck: check(
			"sentiment_dispatch_permits_budget_check",
			sql`${table.estimatedCostBudgetUsd} > 0 AND ${table.estimatedCostBudgetUsd} <= 0.10`,
		),
		amountsCheck: check(
			"sentiment_dispatch_permits_amounts_check",
			sql`${table.settledCostUsd} >= 0 AND ${table.reservedEstimateUsd} >= 0`,
		),
		phaseBudgetCheck: check(
			"sentiment_dispatch_permits_phase_budget_check",
			sql`jsonb_typeof(${table.phaseBudget}) = 'object' AND (${table.phaseBudget} - 'classify' - 'repair' - 'verify') = '{}'::jsonb AND coalesce((${table.phaseBudget}->>'classify')::int, 0) IN (0, 1) AND coalesce((${table.phaseBudget}->>'repair')::int, 0) IN (0, 1) AND coalesce((${table.phaseBudget}->>'verify')::int, 0) IN (0, 1)`,
		),
		// A resume permit can never carry a classify or repair budget (the verify budget drops to 0 once consumed) and
		// is always bound to the frozen manifest it was issued from.
		resumeVerifyCheck: check(
			"sentiment_dispatch_permits_resume_verify_check",
			sql`${table.purpose} <> 'resume-verify' OR (coalesce((${table.phaseBudget}->>'classify')::int, 0) = 0 AND coalesce((${table.phaseBudget}->>'repair')::int, 0) = 0 AND ${table.contractSha256} IS NOT NULL)`,
		),
		// A repair-resume permit carries exactly one repair and one verify (the pair the automatic budget could not
		// afford), never a classify, and is bound to its manifest like the verify-only one.
		resumeRepairCheck: check(
			"sentiment_dispatch_permits_resume_repair_check",
			sql`${table.purpose} <> 'resume-repair' OR (coalesce((${table.phaseBudget}->>'classify')::int, 0) = 0 AND ${table.contractSha256} IS NOT NULL)`,
		),
	}),
).enableRLS();

/**
 * Circuit breaker per `rp1:` request-profile scope (adapter, endpoint, model,
 * tool mode, strict-output mode and the `sfp1:` schema shape). An absent row
 * is `closed`. The half-open probe is a fenced lease on one attempt.
 */
export const sentimentProviderBreakers = pgTable(
	"sentiment_provider_breakers",
	{
		scopeKey: text("scope_key").primaryKey().notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		schemaFp: text("schema_fp").notNull(),
		/** The sanitized request profile the key hashes: no schema document, prompt or credential. */
		requestProfile: jsonb("request_profile").notNull(),
		state: text("state").notNull().default("closed"),
		openedAt: timestamp("opened_at", { withTimezone: true }),
		openUntil: timestamp("open_until", { withTimezone: true }),
		consecutiveFailures: integer("consecutive_failures").notNull().default(0),
		probeAttemptId: uuid("probe_attempt_id"),
		probeGeneration: integer("probe_generation").notNull().default(0),
		probeLeaseUntil: timestamp("probe_lease_until", { withTimezone: true }),
		openedClass: text("opened_class"),
		openedPhase: text("opened_phase"),
		lastAttemptId: uuid("last_attempt_id"),
		lastHttpStatus: integer("last_http_status"),
		lastErrorType: text("last_error_type"),
		lastRule: text("last_rule"),
		lastChangedBy: text("last_changed_by").notNull(),
		lastReason: text("last_reason").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		schemaFpIdx: index("sentiment_provider_breakers_schema_fp_idx").on(table.schemaFp),
		stateCheck: check(
			"sentiment_provider_breakers_state_check",
			sql`${table.state} IN ('closed', 'open', 'half_open')`,
		),
		failuresCheck: check("sentiment_provider_breakers_failures_check", sql`${table.consecutiveFailures} >= 0`),
	}),
).enableRLS();

/** Alert baselines, watermarks, cooldowns and the maintenance heartbeat; written by the alert evaluator (PR-2). */
export const sentimentAlertState = pgTable("sentiment_alert_state", {
	signal: text("signal").primaryKey().notNull(),
	baseline: jsonb("baseline"),
	watermark: jsonb("watermark"),
	evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
	lastAlertedAt: timestamp("last_alerted_at", { withTimezone: true }),
	cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
	updatedBy: text("updated_by"),
	correlationId: text("correlation_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export type SentimentDetection = typeof sentimentDetections.$inferSelect;
export type PromptRunEntityMention = typeof promptRunEntityMentions.$inferSelect;
export type NewPromptRunEntityMention = typeof promptRunEntityMentions.$inferInsert;
export type SentimentAnalysis = typeof sentimentAnalyses.$inferSelect;
export type SentimentObservation = typeof sentimentObservations.$inferSelect;
export type SentimentAspectObservation = typeof sentimentAspectObservations.$inferSelect;
export type SentimentFilteredClaim = typeof sentimentFilteredClaims.$inferSelect;
export type SentimentResolutionCase = typeof sentimentResolutionCases.$inferSelect;
export type SentimentProviderAttempt = typeof sentimentProviderAttempts.$inferSelect;
export type SentimentControl = typeof sentimentControls.$inferSelect;
export type SentimentControlEvent = typeof sentimentControlEvents.$inferSelect;
export type SentimentDispatchPermit = typeof sentimentDispatchPermits.$inferSelect;
export type SentimentProviderBreaker = typeof sentimentProviderBreakers.$inferSelect;
export type SentimentAlertState = typeof sentimentAlertState.$inferSelect;

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
