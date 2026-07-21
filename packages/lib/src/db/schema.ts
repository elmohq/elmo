import {
	boolean,
	check,
	index,
	integer,
	json,
	pgEnum,
	pgTable,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// `organization` is referenced by the brands FK below; the re-export makes it
// (and the rest of the auth schema) visible to `import * as schema` consumers.
import { organization, user } from "./schema-auth";

// Better-auth tables & relations — re-exported so `import * as schema` sees everything.
// Source file is auto-generated; run `pnpm run generate:auth-schema` to refresh.
export * from "./schema-auth";

// ============================================================================
// Application tables
// ============================================================================

export const reportStatusEnum = pgEnum("report_status", ["pending", "processing", "completed", "failed"]);

/**
 * Evaluation configuration is deliberately separate from the deployment
 * environment. A provider connection describes how an instance reaches a
 * provider; targets then describe the concrete model/surface that may run.
 */
export const providerCredentialSourceEnum = pgEnum("provider_credential_source", [
	"legacy_env",
	"encrypted_db",
	"external_reference",
]);

export const evaluationConfigScopeEnum = pgEnum("evaluation_config_scope", ["organization", "brand", "prompt"]);

export const evaluationEntitlementScopeEnum = pgEnum("evaluation_entitlement_scope", ["instance", "organization"]);

/**
 * Singleton instance-level evaluation settings. `id` is always "default";
 * keeping a real table (instead of env defaults) makes its revision available
 * to the worker and configuration UI.
 */
export const instanceSettings = pgTable("instance_settings", {
	id: text("id").primaryKey().notNull().default("default"),
	configurationVersion: integer("configuration_version").notNull().default(0),
	legacyBootstrapAt: timestamp("legacy_bootstrap_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}).enableRLS();

/**
 * Instance-owned provider account. Credentials remain outside this table for
 * now: legacy env mappings are represented without copying a secret into the
 * database, while encrypted/external sources have a place to land later.
 */
export const providerConnections = pgTable(
	"provider_connections",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		key: text("key").notNull(),
		provider: text("provider").notNull(),
		credentialSource: providerCredentialSourceEnum("credential_source").notNull(),
		/** Non-secret source metadata, e.g. { provider: "brightdata" }. */
		credentialReference: json("credential_reference"),
		enabled: boolean("enabled").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		keyUnique: uniqueIndex("provider_connections_key_uidx").on(table.key),
		providerIdx: index("provider_connections_provider_idx").on(table.provider),
	}),
).enableRLS();

/**
 * A stable evaluation target, such as ChatGPT via BrightData with web search.
 * Scope rows can narrow this target but never change its provider identity or
 * instance-level safety defaults.
 */
export const evaluationTargets = pgTable(
	"evaluation_targets",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		key: text("key").notNull(),
		model: text("model").notNull(),
		providerConnectionId: uuid("provider_connection_id")
			.references(() => providerConnections.id)
			.notNull(),
		version: text("version"),
		webSearch: boolean("web_search").notNull().default(false),
		enabled: boolean("enabled").notNull().default(true),
		/** Targets like Claude can opt in only when a prompt explicitly assigns them. */
		requiresPromptAssignment: boolean("requires_prompt_assignment").notNull().default(false),
		defaultCadenceHours: integer("default_cadence_hours").notNull(),
		defaultSamplesPerDispatch: integer("default_samples_per_dispatch").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		keyUnique: uniqueIndex("evaluation_targets_key_uidx").on(table.key),
		defaultsCheck: check(
			"evaluation_targets_defaults_check",
			sql`${table.defaultCadenceHours} > 0 AND ${table.defaultSamplesPerDispatch} > 0`,
		),
		providerConnectionIdx: index("evaluation_targets_provider_connection_id_idx").on(table.providerConnectionId),
		modelIdx: index("evaluation_targets_model_idx").on(table.model),
	}),
).enableRLS();

/**
 * Limits are kept apart from target selection so a plan can cap configuration
 * separately from the number of executions the runtime may consume. The
 * instance row supplies local defaults; cloud billing can add a row for each
 * organization without changing the target-resolution query.
 */
export const evaluationEntitlements = pgTable(
	"evaluation_entitlements",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		scope: evaluationEntitlementScopeEnum("scope").notNull(),
		organizationId: text("organization_id").references(() => organization.id),
		maxConfiguredTargets: integer("max_configured_targets"),
		maxConfiguredTargetsPerBrand: integer("max_configured_targets_per_brand"),
		maxConfiguredTargetsPerPrompt: integer("max_configured_targets_per_prompt"),
		maxSamplesPerDispatch: integer("max_samples_per_dispatch"),
		maxRunsPerDay: integer("max_runs_per_day"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		scopeOwnerCheck: check(
			"evaluation_entitlements_scope_owner_check",
			sql`(
				(${table.scope} = 'instance' AND ${table.organizationId} IS NULL)
				OR (${table.scope} = 'organization' AND ${table.organizationId} IS NOT NULL)
			)`,
		),
		limitsCheck: check(
			"evaluation_entitlements_limits_check",
			sql`(${table.maxConfiguredTargets} IS NULL OR ${table.maxConfiguredTargets} >= 0)
				AND (${table.maxConfiguredTargetsPerBrand} IS NULL OR ${table.maxConfiguredTargetsPerBrand} >= 0)
				AND (${table.maxConfiguredTargetsPerPrompt} IS NULL OR ${table.maxConfiguredTargetsPerPrompt} >= 0)
				AND (${table.maxSamplesPerDispatch} IS NULL OR ${table.maxSamplesPerDispatch} >= 0)
				AND (${table.maxRunsPerDay} IS NULL OR ${table.maxRunsPerDay} >= 0)`,
		),
		instanceUnique: uniqueIndex("evaluation_entitlements_instance_uidx")
			.on(table.scope)
			.where(sql`${table.scope} = 'instance'`),
		organizationUnique: uniqueIndex("evaluation_entitlements_organization_uidx")
			.on(table.organizationId)
			.where(sql`${table.scope} = 'organization'`),
		organizationIdx: index("evaluation_entitlements_organization_id_idx").on(table.organizationId),
	}),
).enableRLS();

/**
 * One typed override table for organization, brand, and prompt scopes. A row
 * with a null target is a scope default; a row with a target narrows that one
 * target. The foreign-key/check combination is intentionally used instead of
 * a polymorphic `scope_id`, so a configuration row cannot point at a resource
 * that does not exist.
 */
export const evaluationTargetScopeConfigs = pgTable(
	"evaluation_target_scope_configs",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		targetId: uuid("target_id").references(() => evaluationTargets.id),
		scope: evaluationConfigScopeEnum("scope").notNull(),
		organizationId: text("organization_id").references(() => organization.id),
		brandId: text("brand_id").references(() => brands.id),
		promptId: uuid("prompt_id").references(() => prompts.id),
		/** null means inherit; false is a permanent narrowing at this scope. */
		enabled: boolean("enabled"),
		cadenceHours: integer("cadence_hours"),
		samplesPerDispatch: integer("samples_per_dispatch"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		scopeOwnerCheck: check(
			"evaluation_target_scope_configs_scope_owner_check",
			sql`(
				(${table.scope} = 'organization' AND ${table.organizationId} IS NOT NULL AND ${table.brandId} IS NULL AND ${table.promptId} IS NULL)
				OR (${table.scope} = 'brand' AND ${table.organizationId} IS NULL AND ${table.brandId} IS NOT NULL AND ${table.promptId} IS NULL)
				OR (${table.scope} = 'prompt' AND ${table.organizationId} IS NULL AND ${table.brandId} IS NULL AND ${table.promptId} IS NOT NULL)
			)`,
		),
		cadenceCheck: check(
			"evaluation_target_scope_configs_cadence_check",
			sql`${table.cadenceHours} IS NULL OR ${table.cadenceHours} > 0`,
		),
		samplesCheck: check(
			"evaluation_target_scope_configs_samples_check",
			sql`${table.samplesPerDispatch} IS NULL OR ${table.samplesPerDispatch} > 0`,
		),
		organizationTargetUnique: uniqueIndex("evaluation_target_scope_configs_org_target_uidx")
			.on(table.organizationId, table.targetId)
			.where(sql`${table.scope} = 'organization' AND ${table.targetId} IS NOT NULL`),
		organizationDefaultUnique: uniqueIndex("evaluation_target_scope_configs_org_default_uidx")
			.on(table.organizationId)
			.where(sql`${table.scope} = 'organization' AND ${table.targetId} IS NULL`),
		brandTargetUnique: uniqueIndex("evaluation_target_scope_configs_brand_target_uidx")
			.on(table.brandId, table.targetId)
			.where(sql`${table.scope} = 'brand' AND ${table.targetId} IS NOT NULL`),
		brandDefaultUnique: uniqueIndex("evaluation_target_scope_configs_brand_default_uidx")
			.on(table.brandId)
			.where(sql`${table.scope} = 'brand' AND ${table.targetId} IS NULL`),
		promptTargetUnique: uniqueIndex("evaluation_target_scope_configs_prompt_target_uidx")
			.on(table.promptId, table.targetId)
			.where(sql`${table.scope} = 'prompt' AND ${table.targetId} IS NOT NULL`),
		promptDefaultUnique: uniqueIndex("evaluation_target_scope_configs_prompt_default_uidx")
			.on(table.promptId)
			.where(sql`${table.scope} = 'prompt' AND ${table.targetId} IS NULL`),
		organizationIdx: index("evaluation_target_scope_configs_organization_id_idx").on(table.organizationId),
		brandIdx: index("evaluation_target_scope_configs_brand_id_idx").on(table.brandId),
		promptIdx: index("evaluation_target_scope_configs_prompt_id_idx").on(table.promptId),
	}),
).enableRLS();

/**
 * Configuration audit records intentionally contain metadata/diffs only;
 * provider credential material must never be stored in an audit log.
 */
export const evaluationConfigAuditLogs = pgTable(
	"evaluation_config_audit_logs",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		actorUserId: text("actor_user_id").references(() => user.id),
		action: text("action").notNull(),
		scope: evaluationConfigScopeEnum("scope"),
		organizationId: text("organization_id").references(() => organization.id),
		brandId: text("brand_id").references(() => brands.id),
		promptId: uuid("prompt_id").references(() => prompts.id),
		diff: json("diff"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		createdAtIdx: index("evaluation_config_audit_logs_created_at_idx").on(table.createdAt),
		organizationIdx: index("evaluation_config_audit_logs_organization_id_idx").on(table.organizationId),
		brandIdx: index("evaluation_config_audit_logs_brand_id_idx").on(table.brandId),
	}),
).enableRLS();

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
		delayOverrideHours: integer("delay_override_hours"),
		enabledModels: text("enabled_models").array(),
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
		brandId: text("brand_id")
			.references(() => brands.id)
			.notNull(),
		model: text("model").notNull(),
		provider: text("provider"),
		/** Null for historical rows created before database-backed targets existed. */
		evaluationTargetId: uuid("evaluation_target_id").references(() => evaluationTargets.id),
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
		evaluationTargetIdx: index("prompt_runs_evaluation_target_id_idx").on(table.evaluationTargetId),
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
		brandAnalyticsIdx: index("idx_citations_brand_analytics").on(
			table.brandId,
			table.createdAt,
			table.url,
			table.domain,
			table.title,
			table.promptId,
			table.model,
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

export type InstanceSettings = typeof instanceSettings.$inferSelect;
export type ProviderConnection = typeof providerConnections.$inferSelect;
export type EvaluationTarget = typeof evaluationTargets.$inferSelect;
export type EvaluationEntitlement = typeof evaluationEntitlements.$inferSelect;
export type EvaluationTargetScopeConfig = typeof evaluationTargetScopeConfigs.$inferSelect;

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
