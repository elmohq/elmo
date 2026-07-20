import { sql } from "drizzle-orm";
import { pgEnum, pgTable, uuid, text, timestamp, boolean, json, jsonb, index, integer, smallint, check, unique } from "drizzle-orm/pg-core";
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
		website: text("website").notNull(),
		additionalDomains: text("additional_domains").array().notNull().default([]),
		aliases: text("aliases").array().notNull().default([]),
		enabled: boolean("enabled").default(true).notNull(),
		onboarded: boolean("onboarded").default(false).notNull(),
		// Hard tenancy scope. Every brand belongs to exactly one better-auth
		// organization; org membership (the `member` table) is the access-control
		// mechanism — see apps/web/src/lib/auth/helpers.ts. Historically `brand.id`
		// equalled `organization.id`; the 0010 backfill makes that mapping explicit
		// so cloud entitlements/metering/enforcement can join on it.
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

// ============================================================================
// Configuration hierarchy (instance → org → brand → prompt)
//
// `configs` is the single cascading table: one row per (scope, selector, key)
// override, each holding one registry-validated value. Defaults live in code
// (packages/lib/src/config/registry.ts), never in the DB. Things that *exist*
// rather than cascade — the target catalog, provider secrets, org entitlements
// — get their own tables below. Postgres ≥ 15 is required for the
// `UNIQUE NULLS NOT DISTINCT` identity constraints (hand-written in the
// migration; drizzle-kit emits them from the builders here).
// ============================================================================

// The catalog of callable model implementations (replaces SCRAPE_TARGETS).
// organizationId NULL = the instance-wide catalog; a non-null value scopes a
// target to one org (BYO targets, a follow-up). Implementation facts only —
// how often / how much a target runs is cascaded config, not a column here.
export const modelTargets = pgTable(
	"model_targets",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
		model: text("model").notNull(),
		provider: text("provider").notNull(),
		version: text("version"),
		webSearch: boolean("web_search").default(false).notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		priority: integer("priority").default(0).notNull(),
		requiredEntitlement: text("required_entitlement"),
		requestPolicy: jsonb("request_policy"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		organizationIdIdx: index("model_targets_organization_id_idx").on(table.organizationId),
		identityUnique: unique("model_targets_identity_uidx")
			.on(table.organizationId, table.model, table.provider, table.version, table.webSearch)
			.nullsNotDistinct(),
	}),
).enableRLS();

export const configs = pgTable(
	"configs",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		scope: text("scope").notNull(),
		organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
		brandId: text("brand_id").references(() => brands.id, { onDelete: "cascade" }),
		promptId: uuid("prompt_id").references(() => prompts.id, { onDelete: "cascade" }),
		// Selector columns: model = one platform, targetId = one specific target.
		// At most one may be set (CHECK below); both NULL = a selector-less row.
		model: text("model"),
		targetId: uuid("target_id").references(() => modelTargets.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		value: jsonb("value").notNull(),
		updatedBy: text("updated_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		organizationIdIdx: index("configs_organization_id_idx")
			.on(table.organizationId)
			.where(sql`${table.organizationId} IS NOT NULL`),
		brandIdIdx: index("configs_brand_id_idx").on(table.brandId).where(sql`${table.brandId} IS NOT NULL`),
		promptIdIdx: index("configs_prompt_id_idx").on(table.promptId).where(sql`${table.promptId} IS NOT NULL`),
		scopeModelKeyIdx: index("configs_scope_model_key_idx")
			.on(table.scope, table.model, table.key)
			.where(sql`${table.model} IS NOT NULL`),
		targetIdIdx: index("configs_target_id_idx").on(table.targetId).where(sql`${table.targetId} IS NOT NULL`),
		identityUnique: unique("configs_identity_uidx")
			.on(table.scope, table.organizationId, table.brandId, table.promptId, table.model, table.targetId, table.key)
			.nullsNotDistinct(),
		scopeFkCheck: check(
			"configs_scope_fk_check",
			sql`(CASE ${table.scope}
				WHEN 'instance' THEN ${table.organizationId} IS NULL AND ${table.brandId} IS NULL AND ${table.promptId} IS NULL
				WHEN 'organization' THEN ${table.organizationId} IS NOT NULL AND ${table.brandId} IS NULL AND ${table.promptId} IS NULL
				WHEN 'brand' THEN ${table.organizationId} IS NULL AND ${table.brandId} IS NOT NULL AND ${table.promptId} IS NULL
				WHEN 'prompt' THEN ${table.organizationId} IS NULL AND ${table.brandId} IS NULL AND ${table.promptId} IS NOT NULL
				ELSE false END)`,
		),
		selectorCheck: check(
			"configs_selector_check",
			sql`NOT (${table.model} IS NOT NULL AND ${table.targetId} IS NOT NULL)`,
		),
		valueNotNullCheck: check("configs_value_not_json_null_check", sql`jsonb_typeof(${table.value}) <> 'null'`),
	}),
).enableRLS();

// Provider secrets — separate table, strictest access. source = 'encrypted'
// (AES-GCM payload in encryptedData) or 'secret-ref' (Infisical/Vault pointer
// in secretRef). organizationId NULL = instance credential.
export const providerCredentials = pgTable(
	"provider_credentials",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		source: text("source").notNull(),
		encryptedData: jsonb("encrypted_data"),
		secretRef: jsonb("secret_ref"),
		hint: text("hint"),
		lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
		lastVerifyError: text("last_verify_error"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		providerOrgUnique: unique("provider_credentials_provider_org_uidx")
			.on(table.provider, table.organizationId)
			.nullsNotDistinct(),
	}),
).enableRLS();

// Org entitlements: planKey + per-org overrides applied *to* the cascade, not
// values *in* it. Written by staff only; #345 swaps planKey's source to Stripe.
export const organizationSettings = pgTable("organization_settings", {
	organizationId: text("organization_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	planKey: text("plan_key"),
	entitlementOverrides: jsonb("entitlement_overrides"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}).enableRLS();

// One bookkeeping row (id always 'instance'): tracks the one-shot env import.
export const instanceMeta = pgTable(
	"instance_meta",
	{
		id: text("id").primaryKey(),
		envImportedAt: timestamp("env_imported_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		idInstanceCheck: check("instance_meta_id_check", sql`${table.id} = 'instance'`),
	}),
).enableRLS();

export type ModelTarget = typeof modelTargets.$inferSelect;
export type NewModelTarget = typeof modelTargets.$inferInsert;

export type Config = typeof configs.$inferSelect;
export type NewConfig = typeof configs.$inferInsert;

export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type NewProviderCredential = typeof providerCredentials.$inferInsert;

export type OrganizationSettings = typeof organizationSettings.$inferSelect;
export type NewOrganizationSettings = typeof organizationSettings.$inferInsert;

export type InstanceMeta = typeof instanceMeta.$inferSelect;
export type NewInstanceMeta = typeof instanceMeta.$inferInsert;
