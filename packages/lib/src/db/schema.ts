import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	json,
	jsonb,
	pgEnum,
	pgTable,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
// Auth tables need local bindings for application FKs; the re-export keeps the
// full schema visible to `import * as schema` consumers.
import { organization, user } from "./schema-auth";

// Better-auth tables & relations — re-exported so `import * as schema` sees everything.
// Source file is auto-generated; run `pnpm run generate:auth-schema` to refresh.
export * from "./schema-auth";

// ============================================================================
// Application tables
// ============================================================================

/**
 * Better Auth API-key plugin storage. It lives here instead of the generated
 * auth schema because organization ownership is an application invariant: an
 * API key is deleted with its workspace and can never reference a user.
 */
export const apikey = pgTable(
	"apikey",
	{
		id: text("id").primaryKey(),
		configId: text("config_id").default("default").notNull(),
		name: text("name"),
		start: text("start"),
		prefix: text("prefix"),
		key: text("key").notNull(),
		referenceId: text("reference_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		refillInterval: integer("refill_interval"),
		refillAmount: integer("refill_amount"),
		lastRefillAt: timestamp("last_refill_at"),
		enabled: boolean("enabled").default(true),
		rateLimitEnabled: boolean("rate_limit_enabled").default(true),
		rateLimitTimeWindow: integer("rate_limit_time_window").default(60_000),
		rateLimitMax: integer("rate_limit_max").default(120),
		requestCount: integer("request_count").default(0),
		remaining: integer("remaining"),
		lastRequest: timestamp("last_request"),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		permissions: text("permissions"),
		metadata: text("metadata"),
	},
	(table) => [
		index("apikey_config_id_idx").on(table.configId),
		index("apikey_reference_id_idx").on(table.referenceId),
		index("apikey_key_idx").on(table.key),
	],
);

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
	(table) => [
		index("brands_organization_id_idx").on(table.organizationId),
		uniqueIndex("brands_id_organization_id_uidx").on(table.id, table.organizationId),
	],
).enableRLS();

export const brandAnalysisAdmissions = pgTable(
	"brand_analysis_admissions",
	{
		brandId: text("brand_id").primaryKey().notNull(),
		organizationId: text("organization_id").notNull(),
		requestFingerprint: text("request_fingerprint").notNull(),
		jobId: uuid("job_id").notNull(),
		generation: integer("generation").notNull(),
		status: text("status").$type<"pending" | "running" | "completed" | "failed">().notNull(),
		result: jsonb("result"),
		lastError: text("last_error"),
		providerStartedAt: timestamp("provider_started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		failedAt: timestamp("failed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		foreignKey({
			name: "brand_analysis_admissions_brand_organization_fk",
			columns: [table.brandId, table.organizationId],
			foreignColumns: [brands.id, brands.organizationId],
		}).onDelete("cascade"),
		index("brand_analysis_admissions_organization_idx").on(table.organizationId),
		check("brand_analysis_admissions_generation_check", sql`${table.generation} BETWEEN 1 AND 3`),
		check(
			"brand_analysis_admissions_state_check",
			sql`(
				(${table.status} = 'pending' AND ${table.result} IS NULL AND ${table.lastError} IS NULL AND ${table.providerStartedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NULL)
				OR (${table.status} = 'running' AND ${table.result} IS NULL AND ${table.lastError} IS NULL AND ${table.providerStartedAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NULL)
				OR (${table.status} = 'completed' AND ${table.result} IS NOT NULL AND ${table.lastError} IS NULL AND ${table.providerStartedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.failedAt} IS NULL)
				OR (${table.status} = 'failed' AND ${table.result} IS NULL AND ${table.lastError} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NOT NULL)
			)`,
		),
	],
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
	(table) => [
		index("prompts_brand_id_idx").on(table.brandId),
		index("prompts_brand_id_enabled_idx").on(table.brandId, table.enabled),
		uniqueIndex("prompts_id_brand_id_uidx").on(table.id, table.brandId),
	],
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
		// Nullable for deployment modes whose report generator predates
		// organizations. Cloud-created reports must carry this ownership scope.
		organizationId: text("organization_id").references(() => organization.id, { onDelete: "restrict" }),
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
		organizationCreatedAtIdx: index("reports_organization_created_at_idx").on(table.organizationId, table.createdAt),
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
// Cloud billing and tracking control plane
// ============================================================================

export const stripeWebhookStatusEnum = pgEnum("stripe_webhook_status", [
	"pending",
	"processing",
	"processed",
	"ignored",
	"failed",
]);

export const billingSubscriptionItemTypeEnum = pgEnum("billing_subscription_item_type", [
	"base_plan",
	"premium_addon",
	"custom",
]);

export const billingMutationKindEnum = pgEnum("billing_mutation_kind", ["checkout", "plan", "addon"]);

export const billingMutationStatusEnum = pgEnum("billing_mutation_status", ["pending", "applied", "failed"]);

export const organizationDataRetentionStatusEnum = pgEnum("organization_data_retention_status", [
	"scheduled",
	"confirmed",
	"purged",
	"canceled",
]);

export const targetSelectionSourceEnum = pgEnum("target_selection_source", ["plan_default", "user", "operator"]);

export const promptTargetAssignmentSourceEnum = pgEnum("prompt_target_assignment_source", [
	"brand_selection",
	"premium",
	"custom",
]);

export const schedulerRolloutModeEnum = pgEnum("scheduler_rollout_mode", ["legacy", "shadow", "v2", "paused"]);

export const trackingOccurrenceStatusEnum = pgEnum("tracking_occurrence_status", [
	"pending",
	"enqueued",
	"running",
	"succeeded",
	"partial",
	"failed",
	"canceled",
	"skipped",
]);

export const trackingTaskStatusEnum = pgEnum("tracking_task_status", [
	"pending",
	"enqueued",
	"running",
	"succeeded",
	"failed",
	"canceled",
	"skipped",
]);

export const trackingAttemptStatusEnum = pgEnum("tracking_attempt_status", [
	"reserved",
	"started",
	"succeeded",
	"failed",
	"canceled",
]);

export const trackingUsageClassEnum = pgEnum("tracking_usage_class", ["standard", "premium", "custom"]);

/**
 * Append-only revisions of a custom contract's entitlement overrides. The
 * resolver chooses the greatest currently-effective revision, so a scheduled
 * or revoked revision never destroys the contract that preceded it.
 */
export const organizationEntitlementOverrides = pgTable(
	"organization_entitlement_overrides",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		revision: integer("revision").notNull(),
		schemaVersion: integer("schema_version").notNull(),
		entitlements: jsonb("entitlements").$type<Record<string, unknown>>().notNull(),
		effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
		effectiveUntil: timestamp("effective_until", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		reason: text("reason"),
		createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("organization_entitlement_overrides_org_revision_uidx").on(table.organizationId, table.revision),
		index("organization_entitlement_overrides_resolution_idx").on(
			table.organizationId,
			table.effectiveFrom,
			table.revokedAt,
		),
		check("organization_entitlement_overrides_revision_check", sql`${table.revision} > 0`),
		check("organization_entitlement_overrides_schema_version_check", sql`${table.schemaVersion} > 0`),
		check(
			"organization_entitlement_overrides_effective_window_check",
			sql`${table.effectiveUntil} IS NULL OR ${table.effectiveUntil} > ${table.effectiveFrom}`,
		),
	],
).enableRLS();

/** Durable, idempotent inbox. Handlers claim rows instead of doing work inline. */
export const stripeWebhookEvents = pgTable(
	"stripe_webhook_events",
	{
		id: text("id").primaryKey().notNull(),
		type: text("type").notNull(),
		apiVersion: text("api_version"),
		livemode: boolean("livemode").notNull(),
		stripeCreatedAt: timestamp("stripe_created_at", { withTimezone: true }).notNull(),
		payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
		status: stripeWebhookStatusEnum().default("pending").notNull(),
		attemptCount: integer("attempt_count").default(0).notNull(),
		nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
		processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
		processedAt: timestamp("processed_at", { withTimezone: true }),
		lastError: text("last_error"),
		receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("stripe_webhook_events_claim_idx").on(table.status, table.nextAttemptAt, table.receivedAt),
		index("stripe_webhook_events_type_created_idx").on(table.type, table.stripeCreatedAt),
		check("stripe_webhook_events_attempt_count_check", sql`${table.attemptCount} >= 0`),
	],
).enableRLS();

/**
 * Current Stripe subscription projection for an organization. Webhook
 * processing must retrieve the current Stripe subscription before replacing
 * this row; source event metadata is retained to make stale delivery visible.
 */
export const organizationBillingSubscriptions = pgTable(
	"organization_billing_subscriptions",
	{
		organizationId: text("organization_id")
			.primaryKey()
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		stripeSubscriptionId: text("stripe_subscription_id").notNull(),
		stripeCustomerId: text("stripe_customer_id").notNull(),
		status: text("status").notNull(),
		basePlanKey: text("base_plan_key"),
		billingInterval: text("billing_interval"),
		currency: text("currency"),
		currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
		currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
		cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
		cancelAt: timestamp("cancel_at", { withTimezone: true }),
		canceledAt: timestamp("canceled_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		delinquentSince: timestamp("delinquent_since", { withTimezone: true }),
		sourceEventId: text("source_event_id").references(() => stripeWebhookEvents.id),
		sourceEventCreatedAt: timestamp("source_event_created_at", { withTimezone: true }),
		sourceSnapshot: jsonb("source_snapshot").$type<Record<string, unknown>>().notNull(),
		syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("organization_billing_subscriptions_stripe_subscription_uidx").on(table.stripeSubscriptionId),
		uniqueIndex("organization_billing_subscriptions_stripe_customer_uidx").on(table.stripeCustomerId),
		index("organization_billing_subscriptions_status_idx").on(table.status),
		index("organization_billing_subscriptions_period_end_idx").on(table.currentPeriodEnd),
	],
).enableRLS();

/** Active and historical line items from the current subscription snapshot. */
export const organizationBillingSubscriptionItems = pgTable(
	"organization_billing_subscription_items",
	{
		stripeSubscriptionItemId: text("stripe_subscription_item_id").primaryKey().notNull(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organizationBillingSubscriptions.organizationId, { onDelete: "cascade" }),
		stripePriceId: text("stripe_price_id").notNull(),
		stripePriceLookupKey: text("stripe_price_lookup_key"),
		type: billingSubscriptionItemTypeEnum().notNull(),
		quantity: integer("quantity").default(1).notNull(),
		active: boolean("active").default(true).notNull(),
		sourceEventId: text("source_event_id").references(() => stripeWebhookEvents.id),
		sourceEventCreatedAt: timestamp("source_event_created_at", { withTimezone: true }),
		sourceSnapshot: jsonb("source_snapshot").$type<Record<string, unknown>>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("organization_billing_subscription_items_org_idx").on(table.organizationId),
		uniqueIndex("organization_billing_subscription_items_active_base_uidx")
			.on(table.organizationId)
			.where(sql`${table.active} = true AND ${table.type} = 'base_plan'`),
		uniqueIndex("organization_billing_subscription_items_active_premium_uidx")
			.on(table.organizationId)
			.where(sql`${table.active} = true AND ${table.type} = 'premium_addon'`),
		check("organization_billing_subscription_items_quantity_check", sql`${table.quantity} > 0`),
	],
).enableRLS();

/**
 * Durable self-serve commands. A pending row is an entitlement fence until an
 * atomic Stripe update has also been projected locally, including after a
 * process or network failure between those two systems.
 */
export const organizationBillingMutations = pgTable(
	"organization_billing_mutations",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		mutationId: text("mutation_id").notNull(),
		kind: billingMutationKindEnum().notNull(),
		status: billingMutationStatusEnum().default("pending").notNull(),
		stripeSubscriptionId: text("stripe_subscription_id"),
		stripeCustomerId: text("stripe_customer_id"),
		stripeIdempotencyKey: text("stripe_idempotency_key").notNull(),
		targetPlanKey: text("target_plan_key").notNull(),
		targetBillingInterval: text("target_billing_interval").notNull(),
		targetClaudeAddonPromptSlots: integer("target_claude_addon_prompt_slots").notNull(),
		stripeUpdateParams: jsonb("stripe_update_params").$type<Record<string, unknown>>().notNull(),
		stripeCheckoutSessionId: text("stripe_checkout_session_id"),
		stripeCheckoutSessionUrl: text("stripe_checkout_session_url"),
		stripeCheckoutExpiresAt: timestamp("stripe_checkout_expires_at", { withTimezone: true }),
		attemptCount: integer("attempt_count").default(0).notNull(),
		nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
		lastError: text("last_error"),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("organization_billing_mutations_org_mutation_uidx").on(table.organizationId, table.mutationId),
		uniqueIndex("organization_billing_mutations_stripe_idempotency_uidx").on(table.stripeIdempotencyKey),
		uniqueIndex("organization_billing_mutations_one_pending_uidx")
			.on(table.organizationId)
			.where(sql`${table.status} = 'pending'`),
		index("organization_billing_mutations_recovery_idx").on(table.status, table.nextAttemptAt, table.createdAt),
		check("organization_billing_mutations_interval_check", sql`${table.targetBillingInterval} IN ('month', 'year')`),
		check("organization_billing_mutations_addon_slots_check", sql`${table.targetClaudeAddonPromptSlots} >= 0`),
		check("organization_billing_mutations_attempt_count_check", sql`${table.attemptCount} >= 0`),
	],
).enableRLS();

/**
 * Append-only terminal-subscription retention cycles. Product deletion is
 * recorded here instead of on the organization so a later subscription can
 * start with an empty workspace without erasing an earlier accounting trail.
 */
export const organizationDataRetentionRuns = pgTable(
	"organization_data_retention_runs",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "restrict" }),
		stripeCustomerId: text("stripe_customer_id").notNull(),
		stripeSubscriptionId: text("stripe_subscription_id").notNull(),
		sourceSubscriptionStatus: text("source_subscription_status").notNull(),
		sourceSubscriptionEndedAt: timestamp("source_subscription_ended_at", { withTimezone: true }).notNull(),
		eligibleAt: timestamp("eligible_at", { withTimezone: true }).notNull(),
		sourceSubscriptionSyncedAt: timestamp("source_subscription_synced_at", { withTimezone: true }).notNull(),
		status: organizationDataRetentionStatusEnum().default("scheduled").notNull(),
		scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow().notNull(),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
		purgeAfter: timestamp("purge_after", { withTimezone: true }),
		purgedAt: timestamp("purged_at", { withTimezone: true }),
		canceledAt: timestamp("canceled_at", { withTimezone: true }),
		cancelReason: text("cancel_reason"),
		checkAttemptCount: integer("check_attempt_count").default(0).notNull(),
		lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
		lastError: text("last_error"),
		purgeSummary: jsonb("purge_summary").$type<Record<string, number>>(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("organization_data_retention_runs_source_uidx").on(
			table.organizationId,
			table.stripeSubscriptionId,
			table.sourceSubscriptionEndedAt,
		),
		uniqueIndex("organization_data_retention_runs_open_org_uidx")
			.on(table.organizationId)
			.where(sql`${table.status} IN ('scheduled', 'confirmed')`),
		index("organization_data_retention_runs_due_idx").on(table.status, table.eligibleAt),
		check(
			"organization_data_retention_runs_eligibility_check",
			sql`${table.eligibleAt} = ${table.sourceSubscriptionEndedAt} + INTERVAL '1440 hours'`,
		),
		check(
			"organization_data_retention_runs_source_status_check",
			sql`${table.sourceSubscriptionStatus} IN ('canceled', 'incomplete_expired')`,
		),
		check("organization_data_retention_runs_attempt_count_check", sql`${table.checkAttemptCount} >= 0`),
		check(
			"organization_data_retention_runs_state_check",
			sql`(
				(${table.status} = 'scheduled' AND ${table.confirmedAt} IS NULL AND ${table.purgeAfter} IS NULL AND ${table.purgedAt} IS NULL AND ${table.canceledAt} IS NULL AND ${table.cancelReason} IS NULL AND ${table.purgeSummary} IS NULL)
				OR (${table.status} = 'confirmed' AND ${table.confirmedAt} IS NOT NULL AND ${table.purgeAfter} IS NOT NULL AND ${table.purgeAfter} >= ${table.eligibleAt} AND ${table.purgeAfter} > ${table.confirmedAt} AND ${table.purgedAt} IS NULL AND ${table.canceledAt} IS NULL AND ${table.cancelReason} IS NULL AND ${table.purgeSummary} IS NULL)
				OR (${table.status} = 'purged' AND ${table.confirmedAt} IS NOT NULL AND ${table.purgeAfter} IS NOT NULL AND ${table.purgeAfter} >= ${table.eligibleAt} AND ${table.purgeAfter} > ${table.confirmedAt} AND ${table.purgedAt} IS NOT NULL AND ${table.canceledAt} IS NULL AND ${table.cancelReason} IS NULL AND ${table.purgeSummary} IS NOT NULL)
				OR (${table.status} = 'canceled' AND ${table.purgedAt} IS NULL AND ${table.canceledAt} IS NOT NULL AND ${table.cancelReason} IS NOT NULL AND ${table.purgeSummary} IS NULL)
			)`,
		),
	],
).enableRLS();

/**
 * Organization-level cursor for deriving v2 schedules from billing and custom
 * contract state. A nullable reconcile time means the current source token is
 * fully applied and has no known future contract boundary.
 */
export const organizationEntitlementReconciliations = pgTable(
	"organization_entitlement_reconciliations",
	{
		organizationId: text("organization_id")
			.primaryKey()
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		appliedSourceToken: text("applied_source_token"),
		reconcileAfter: timestamp("reconcile_after", { withTimezone: true }),
		lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("organization_entitlement_reconciliations_due_idx").on(table.reconcileAfter)],
).enableRLS();

export const brandTargetSelections = pgTable(
	"brand_target_selections",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.notNull()
			.references(() => brands.id, { onDelete: "cascade" }),
		targetKey: text("target_key").notNull(),
		requestedCadenceMinutes: integer("requested_cadence_minutes"),
		source: targetSelectionSourceEnum().default("user").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("brand_target_selections_brand_target_uidx").on(table.brandId, table.targetKey),
		uniqueIndex("brand_target_selections_identity_uidx").on(table.id, table.brandId, table.targetKey),
		index("brand_target_selections_brand_enabled_idx").on(table.brandId, table.enabled),
		check(
			"brand_target_selections_requested_cadence_check",
			sql`${table.requestedCadenceMinutes} IS NULL OR ${table.requestedCadenceMinutes} > 0`,
		),
	],
).enableRLS();

export const promptTargetAssignments = pgTable(
	"prompt_target_assignments",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.notNull()
			.references(() => brands.id, { onDelete: "cascade" }),
		promptId: uuid("prompt_id").notNull(),
		brandTargetSelectionId: uuid("brand_target_selection_id"),
		targetKey: text("target_key").notNull(),
		source: promptTargetAssignmentSourceEnum().notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("prompt_target_assignments_prompt_target_uidx").on(table.promptId, table.targetKey),
		uniqueIndex("prompt_target_assignments_identity_uidx").on(table.id, table.brandId, table.promptId, table.targetKey),
		index("prompt_target_assignments_brand_enabled_idx").on(table.brandId, table.enabled),
		index("prompt_target_assignments_selection_idx").on(table.brandTargetSelectionId),
		foreignKey({
			name: "prompt_target_assignments_prompt_brand_fk",
			columns: [table.promptId, table.brandId],
			foreignColumns: [prompts.id, prompts.brandId],
		}).onDelete("cascade"),
		foreignKey({
			name: "prompt_target_assignments_selection_identity_fk",
			columns: [table.brandTargetSelectionId, table.brandId, table.targetKey],
			foreignColumns: [brandTargetSelections.id, brandTargetSelections.brandId, brandTargetSelections.targetKey],
		}).onDelete("restrict"),
		check(
			"prompt_target_assignments_selection_source_check",
			sql`(${table.source} = 'brand_selection' AND ${table.brandTargetSelectionId} IS NOT NULL) OR (${table.source} <> 'brand_selection' AND ${table.brandTargetSelectionId} IS NULL)`,
		),
	],
).enableRLS();

/** Missing rows intentionally mean legacy scheduling. */
export const brandSchedulerRollouts = pgTable(
	"brand_scheduler_rollouts",
	{
		brandId: text("brand_id")
			.primaryKey()
			.notNull()
			.references(() => brands.id, { onDelete: "cascade" }),
		mode: schedulerRolloutModeEnum().default("legacy").notNull(),
		generation: integer("generation").default(1).notNull(),
		shadowStartedAt: timestamp("shadow_started_at", { withTimezone: true }),
		cutoverAt: timestamp("cutover_at", { withTimezone: true }),
		lastRolledBackAt: timestamp("last_rolled_back_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("brand_scheduler_rollouts_mode_idx").on(table.mode),
		check("brand_scheduler_rollouts_generation_check", sql`${table.generation} > 0`),
	],
).enableRLS();

export const trackingSchedules = pgTable(
	"tracking_schedules",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id")
			.notNull()
			.references(() => brands.id, { onDelete: "cascade" }),
		promptId: uuid("prompt_id")
			.notNull()
			.references(() => prompts.id, { onDelete: "cascade" }),
		promptTargetAssignmentId: uuid("prompt_target_assignment_id").notNull(),
		targetKey: text("target_key").notNull(),
		cadenceMinutes: integer("cadence_minutes").notNull(),
		samplesPerOccurrence: smallint("samples_per_occurrence").notNull(),
		active: boolean("active").default(true).notNull(),
		nextDueAt: timestamp("next_due_at", { withTimezone: true }),
		generation: integer("generation").notNull(),
		policyVersion: integer("policy_version").notNull(),
		lastMaterializedAt: timestamp("last_materialized_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("tracking_schedules_prompt_target_uidx").on(table.promptId, table.targetKey),
		uniqueIndex("tracking_schedules_assignment_uidx").on(table.promptTargetAssignmentId),
		uniqueIndex("tracking_schedules_identity_uidx").on(table.id, table.brandId, table.promptId, table.targetKey),
		index("tracking_schedules_due_idx").on(table.active, table.nextDueAt),
		index("tracking_schedules_brand_generation_idx").on(table.brandId, table.generation),
		foreignKey({
			name: "tracking_schedules_assignment_identity_fk",
			columns: [table.promptTargetAssignmentId, table.brandId, table.promptId, table.targetKey],
			foreignColumns: [
				promptTargetAssignments.id,
				promptTargetAssignments.brandId,
				promptTargetAssignments.promptId,
				promptTargetAssignments.targetKey,
			],
		}).onDelete("cascade"),
		check("tracking_schedules_cadence_check", sql`${table.cadenceMinutes} > 0`),
		check("tracking_schedules_samples_check", sql`${table.samplesPerOccurrence} > 0`),
		check("tracking_schedules_generation_check", sql`${table.generation} > 0`),
		check("tracking_schedules_policy_version_check", sql`${table.policyVersion} > 0`),
	],
).enableRLS();

export const trackingOccurrences = pgTable(
	"tracking_occurrences",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id").notNull(),
		promptId: uuid("prompt_id").notNull(),
		targetKey: text("target_key").notNull(),
		scheduleId: uuid("schedule_id").notNull(),
		dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
		generation: integer("generation").notNull(),
		policyVersion: integer("policy_version").notNull(),
		policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
		status: trackingOccurrenceStatusEnum().default("pending").notNull(),
		expectedTaskCount: smallint("expected_task_count").notNull(),
		materializedAt: timestamp("materialized_at", { withTimezone: true }).defaultNow().notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("tracking_occurrences_schedule_due_uidx").on(table.scheduleId, table.dueAt),
		uniqueIndex("tracking_occurrences_identity_uidx").on(table.id, table.brandId, table.promptId, table.targetKey),
		index("tracking_occurrences_status_due_idx").on(table.status, table.dueAt),
		index("tracking_occurrences_brand_due_idx").on(table.brandId, table.dueAt),
		foreignKey({
			name: "tracking_occurrences_schedule_identity_fk",
			columns: [table.scheduleId, table.brandId, table.promptId, table.targetKey],
			foreignColumns: [
				trackingSchedules.id,
				trackingSchedules.brandId,
				trackingSchedules.promptId,
				trackingSchedules.targetKey,
			],
		}).onDelete("cascade"),
		check("tracking_occurrences_generation_check", sql`${table.generation} > 0`),
		check("tracking_occurrences_policy_version_check", sql`${table.policyVersion} > 0`),
		check("tracking_occurrences_task_count_check", sql`${table.expectedTaskCount} > 0`),
	],
).enableRLS();

/** pg-boss payloads contain only this stable task id. */
export const trackingTasks = pgTable(
	"tracking_tasks",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		brandId: text("brand_id").notNull(),
		promptId: uuid("prompt_id").notNull(),
		occurrenceId: uuid("occurrence_id").notNull(),
		sampleIndex: smallint("sample_index").notNull(),
		targetKey: text("target_key").notNull(),
		status: trackingTaskStatusEnum().default("pending").notNull(),
		queueName: text("queue_name"),
		pgBossJobId: uuid("pg_boss_job_id"),
		attemptCount: integer("attempt_count").default(0).notNull(),
		availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
		claimedAt: timestamp("claimed_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		lastError: text("last_error"),
		promptRunId: uuid("prompt_run_id").references(() => promptRuns.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("tracking_tasks_occurrence_sample_uidx").on(table.occurrenceId, table.sampleIndex),
		uniqueIndex("tracking_tasks_pg_boss_job_uidx").on(table.pgBossJobId),
		uniqueIndex("tracking_tasks_identity_uidx").on(table.id, table.brandId, table.promptId, table.targetKey),
		index("tracking_tasks_claim_idx").on(table.status, table.availableAt),
		index("tracking_tasks_target_idx").on(table.targetKey),
		foreignKey({
			name: "tracking_tasks_occurrence_identity_fk",
			columns: [table.occurrenceId, table.brandId, table.promptId, table.targetKey],
			foreignColumns: [
				trackingOccurrences.id,
				trackingOccurrences.brandId,
				trackingOccurrences.promptId,
				trackingOccurrences.targetKey,
			],
		}).onDelete("cascade"),
		check("tracking_tasks_sample_index_check", sql`${table.sampleIndex} >= 0`),
		check("tracking_tasks_attempt_count_check", sql`${table.attemptCount} >= 0`),
	],
).enableRLS();

/**
 * Atomic budget counter. A reservation increments usedUnits with a conditional
 * UPDATE and inserts its provider-attempt row in the same transaction.
 */
export const trackingUsageBuckets = pgTable(
	"tracking_usage_buckets",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "restrict" }),
		usageClass: trackingUsageClassEnum("usage_class").notNull(),
		quotaKey: text("quota_key").notNull(),
		periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
		periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
		limitUnits: integer("limit_units").notNull(),
		usedUnits: integer("used_units").default(0).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("tracking_usage_buckets_period_uidx").on(
			table.organizationId,
			table.usageClass,
			table.quotaKey,
			table.periodStart,
		),
		uniqueIndex("tracking_usage_buckets_attempt_identity_uidx").on(
			table.id,
			table.organizationId,
			table.usageClass,
			table.periodStart,
			table.periodEnd,
		),
		index("tracking_usage_buckets_expiry_idx").on(table.organizationId, table.periodEnd),
		check("tracking_usage_buckets_window_check", sql`${table.periodEnd} > ${table.periodStart}`),
		check("tracking_usage_buckets_limit_check", sql`${table.limitUnits} >= 0`),
		check(
			"tracking_usage_buckets_used_check",
			sql`${table.usedUnits} >= 0 AND ${table.usedUnits} <= ${table.limitUnits}`,
		),
	],
).enableRLS();

/**
 * One durable row per provider request attempt. Reservations are inserted before
 * network I/O; failed paid requests remain countable and pre-dispatch cancels
 * can release their reservation without deleting the audit record.
 */
export const trackingProviderAttempts = pgTable(
	"tracking_provider_attempts",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		taskId: uuid("task_id"),
		organizationId: text("organization_id").notNull(),
		brandId: text("brand_id"),
		promptId: uuid("prompt_id"),
		targetKey: text("target_key").notNull(),
		usageClass: trackingUsageClassEnum("usage_class").notNull(),
		usageBucketId: uuid("usage_bucket_id"),
		attemptNumber: smallint("attempt_number").notNull(),
		status: trackingAttemptStatusEnum().default("reserved").notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		modelVersion: text("model_version"),
		webSearchEnabled: boolean("web_search_enabled").notNull(),
		usageUnits: integer("usage_units").default(1).notNull(),
		countsTowardLimit: boolean("counts_toward_limit").default(true).notNull(),
		quotaPeriodStart: timestamp("quota_period_start", { withTimezone: true }),
		quotaPeriodEnd: timestamp("quota_period_end", { withTimezone: true }),
		providerRequestId: text("provider_request_id"),
		inputTokens: integer("input_tokens"),
		outputTokens: integer("output_tokens"),
		webSearchRequests: integer("web_search_requests"),
		costMicrousd: bigint("cost_microusd", { mode: "number" }),
		errorCode: text("error_code"),
		errorMessage: text("error_message"),
		promptRunId: uuid("prompt_run_id").references(() => promptRuns.id, { onDelete: "set null" }),
		retentionRunId: uuid("retention_run_id").references(() => organizationDataRetentionRuns.id, {
			onDelete: "restrict",
		}),
		reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("tracking_provider_attempts_task_attempt_uidx").on(table.taskId, table.attemptNumber),
		index("tracking_provider_attempts_org_quota_idx")
			.on(table.organizationId, table.usageClass, table.quotaPeriodStart)
			.where(sql`${table.countsTowardLimit} = true`),
		index("tracking_provider_attempts_brand_created_idx").on(table.brandId, table.createdAt),
		index("tracking_provider_attempts_prompt_created_idx").on(table.promptId, table.createdAt),
		index("tracking_provider_attempts_provider_request_idx").on(table.provider, table.providerRequestId),
		index("tracking_provider_attempts_usage_bucket_idx").on(table.usageBucketId),
		foreignKey({
			name: "tracking_provider_attempts_task_identity_fk",
			columns: [table.taskId, table.brandId, table.promptId, table.targetKey],
			foreignColumns: [trackingTasks.id, trackingTasks.brandId, trackingTasks.promptId, trackingTasks.targetKey],
		}).onDelete("restrict"),
		foreignKey({
			name: "tracking_provider_attempts_brand_organization_fk",
			columns: [table.brandId, table.organizationId],
			foreignColumns: [brands.id, brands.organizationId],
		}).onDelete("restrict"),
		foreignKey({
			name: "tracking_provider_attempts_prompt_brand_fk",
			columns: [table.promptId, table.brandId],
			foreignColumns: [prompts.id, prompts.brandId],
		}).onDelete("restrict"),
		foreignKey({
			name: "tracking_provider_attempts_usage_bucket_identity_fk",
			columns: [
				table.usageBucketId,
				table.organizationId,
				table.usageClass,
				table.quotaPeriodStart,
				table.quotaPeriodEnd,
			],
			foreignColumns: [
				trackingUsageBuckets.id,
				trackingUsageBuckets.organizationId,
				trackingUsageBuckets.usageClass,
				trackingUsageBuckets.periodStart,
				trackingUsageBuckets.periodEnd,
			],
		}).onDelete("restrict"),
		check("tracking_provider_attempts_attempt_number_check", sql`${table.attemptNumber} > 0`),
		check("tracking_provider_attempts_usage_units_check", sql`${table.usageUnits} >= 0`),
		check(
			"tracking_provider_attempts_retention_state_check",
			sql`(
				(${table.retentionRunId} IS NULL AND ${table.taskId} IS NOT NULL AND ${table.brandId} IS NOT NULL AND ${table.promptId} IS NOT NULL)
				OR (${table.retentionRunId} IS NOT NULL AND ${table.taskId} IS NULL AND ${table.brandId} IS NULL AND ${table.promptId} IS NULL AND ${table.promptRunId} IS NULL)
			)`,
		),
		check(
			"tracking_provider_attempts_counted_bucket_check",
			sql`${table.countsTowardLimit} = false OR (${table.usageBucketId} IS NOT NULL AND ${table.quotaPeriodStart} IS NOT NULL AND ${table.quotaPeriodEnd} IS NOT NULL)`,
		),
		check(
			"tracking_provider_attempts_quota_window_check",
			sql`${table.quotaPeriodEnd} IS NULL OR (${table.quotaPeriodStart} IS NOT NULL AND ${table.quotaPeriodEnd} > ${table.quotaPeriodStart})`,
		),
		check(
			"tracking_provider_attempts_input_tokens_check",
			sql`${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0`,
		),
		check(
			"tracking_provider_attempts_output_tokens_check",
			sql`${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0`,
		),
		check(
			"tracking_provider_attempts_web_search_requests_check",
			sql`${table.webSearchRequests} IS NULL OR ${table.webSearchRequests} >= 0`,
		),
		check("tracking_provider_attempts_cost_check", sql`${table.costMicrousd} IS NULL OR ${table.costMicrousd} >= 0`),
	],
).enableRLS();

export type OrganizationEntitlementOverride = typeof organizationEntitlementOverrides.$inferSelect;
export type NewOrganizationEntitlementOverride = typeof organizationEntitlementOverrides.$inferInsert;
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;
export type OrganizationBillingSubscription = typeof organizationBillingSubscriptions.$inferSelect;
export type NewOrganizationBillingSubscription = typeof organizationBillingSubscriptions.$inferInsert;
export type OrganizationBillingSubscriptionItem = typeof organizationBillingSubscriptionItems.$inferSelect;
export type NewOrganizationBillingSubscriptionItem = typeof organizationBillingSubscriptionItems.$inferInsert;
export type OrganizationBillingMutation = typeof organizationBillingMutations.$inferSelect;
export type NewOrganizationBillingMutation = typeof organizationBillingMutations.$inferInsert;
export type OrganizationDataRetentionRun = typeof organizationDataRetentionRuns.$inferSelect;
export type NewOrganizationDataRetentionRun = typeof organizationDataRetentionRuns.$inferInsert;
export type OrganizationEntitlementReconciliation = typeof organizationEntitlementReconciliations.$inferSelect;
export type NewOrganizationEntitlementReconciliation = typeof organizationEntitlementReconciliations.$inferInsert;
export type BrandTargetSelection = typeof brandTargetSelections.$inferSelect;
export type NewBrandTargetSelection = typeof brandTargetSelections.$inferInsert;
export type PromptTargetAssignment = typeof promptTargetAssignments.$inferSelect;
export type NewPromptTargetAssignment = typeof promptTargetAssignments.$inferInsert;
export type BrandSchedulerRollout = typeof brandSchedulerRollouts.$inferSelect;
export type NewBrandSchedulerRollout = typeof brandSchedulerRollouts.$inferInsert;
export type TrackingSchedule = typeof trackingSchedules.$inferSelect;
export type NewTrackingSchedule = typeof trackingSchedules.$inferInsert;
export type TrackingOccurrence = typeof trackingOccurrences.$inferSelect;
export type NewTrackingOccurrence = typeof trackingOccurrences.$inferInsert;
export type TrackingTask = typeof trackingTasks.$inferSelect;
export type NewTrackingTask = typeof trackingTasks.$inferInsert;
export type TrackingUsageBucket = typeof trackingUsageBuckets.$inferSelect;
export type NewTrackingUsageBucket = typeof trackingUsageBuckets.$inferInsert;
export type TrackingProviderAttempt = typeof trackingProviderAttempts.$inferSelect;
export type NewTrackingProviderAttempt = typeof trackingProviderAttempts.$inferInsert;
