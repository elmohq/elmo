import {
	boolean,
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

export const promptExecutionStatusEnum = pgEnum("prompt_execution_status", [
	"running",
	"succeeded",
	"partial",
	"failed",
	"skipped",
]);

export const promptExecutionTriggerEnum = pgEnum("prompt_execution_trigger", ["scheduled", "manual"]);

export const promptExecutionRunStatusEnum = pgEnum("prompt_execution_run_status", [
	"pending",
	"running",
	"processing",
	"succeeded",
	"failed",
	"skipped",
]);

export const providerCircuitStateEnum = pgEnum("provider_circuit_state", ["closed", "open", "half_open"]);

/**
 * Durable recurring intent for one prompt. A leased row is only being turned
 * into an execution; paid provider work lives in provider_call_reservations.
 */
export const promptSchedules = pgTable(
	"prompt_schedules",
	{
		promptId: uuid("prompt_id")
			.references(() => prompts.id, { onDelete: "cascade" })
			.primaryKey()
			.notNull(),
		nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
		runRequestedAt: timestamp("run_requested_at", { withTimezone: true }),
		leaseOwner: text("lease_owner"),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
		admissionPausedUntil: timestamp("admission_paused_until", { withTimezone: true }),
		pauseReason: text("pause_reason"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		dueIdx: index("prompt_schedules_due_idx").on(table.nextRunAt),
		requestIdx: index("prompt_schedules_request_idx").on(table.runRequestedAt),
		leaseIdx: index("prompt_schedules_lease_idx").on(table.leaseExpiresAt),
	}),
).enableRLS();

/**
 * Permanent database fence for the retired pg-boss prompt queue. New workers
 * close it before draining legacy handlers, so mixed-version deploys cannot
 * submit legacy and durable calls for the same prompt.
 */
export const workerSchedulerControl = pgTable("worker_scheduler_control", {
	id: text("id").primaryKey().notNull(),
	admissionClosedAt: timestamp("admission_closed_at", { withTimezone: true }),
	cutoverCompletedAt: timestamp("cutover_completed_at", { withTimezone: true }),
}).enableRLS();

/** Immutable matching inputs for every paid unit in one prompt execution. */
export interface PromptExecutionContextSnapshot {
	prompt: {
		id: string;
		value: string;
	};
	brand: {
		id: string;
		name: string;
		website: string;
		aliases: string[];
		additionalDomains: string[];
	};
	competitors: Array<{
		id: string;
		name: string;
		aliases: string[];
		domains: string[];
	}>;
}

/** One scheduled or operator-requested prompt cycle. */
export const promptExecutions = pgTable(
	"prompt_executions",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		// Deliberately retained without an FK: deleting a prompt must never erase
		// the safety ledger for provider work that may still be running or billed.
		promptId: uuid("prompt_id").notNull(),
		contextPayload: json("context_payload").$type<PromptExecutionContextSnapshot>(),
		trigger: promptExecutionTriggerEnum("trigger").notNull(),
		scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
		notAfter: timestamp("not_after", { withTimezone: true }).notNull(),
		status: promptExecutionStatusEnum("status").default("running").notNull(),
		totalRuns: integer("total_runs").default(0).notNull(),
		succeededRuns: integer("succeeded_runs").default(0).notNull(),
		failedRuns: integer("failed_runs").default(0).notNull(),
		skippedRuns: integer("skipped_runs").default(0).notNull(),
		errorSummary: text("error_summary"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		identityIdx: uniqueIndex("prompt_executions_identity_idx").on(table.promptId, table.trigger, table.scheduledFor),
		promptCreatedIdx: index("prompt_executions_prompt_created_idx").on(table.promptId, table.createdAt),
		statusDeadlineIdx: index("prompt_executions_status_deadline_idx").on(table.status, table.notAfter),
	}),
).enableRLS();

/** Business outcome and local processing lease for one materialized prompt run. */
export const promptExecutionRuns = pgTable(
	"prompt_execution_runs",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		executionId: uuid("execution_id")
			.references(() => promptExecutions.id, { onDelete: "cascade" })
			.notNull(),
		promptRunId: uuid("prompt_run_id").references(() => promptRuns.id, { onDelete: "set null" }),
		targetIndex: smallint("target_index").notNull(),
		runIndex: smallint("run_index").notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		version: text("version"),
		webSearchEnabled: boolean("web_search_enabled").notNull(),
		status: promptExecutionRunStatusEnum("status").default("pending").notNull(),
		availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
		workerId: text("worker_id"),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		localAttempts: integer("local_attempts").default(0).notNull(),
		failureKind: text("failure_kind"),
		errorMessage: text("error_message"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		identityIdx: uniqueIndex("prompt_execution_runs_identity_idx").on(
			table.executionId,
			table.targetIndex,
			table.runIndex,
		),
		promptRunIdx: uniqueIndex("prompt_execution_runs_prompt_run_idx").on(table.promptRunId),
		claimIdx: index("prompt_execution_runs_claim_idx").on(table.status, table.availableAt, table.createdAt),
	}),
).enableRLS();

/** Circuit state is shared by every worker replica and survives restarts. */
export const providerHealth = pgTable("provider_health", {
	circuitKey: text("circuit_key").primaryKey().notNull(),
	circuitState: providerCircuitStateEnum("circuit_state").default("closed").notNull(),
	consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
	openedAt: timestamp("opened_at", { withTimezone: true }),
	reopenAt: timestamp("reopen_at", { withTimezone: true }),
	probeRunId: uuid("probe_run_id"),
	lastFailureKind: text("last_failure_kind"),
	lastError: text("last_error"),
	lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}).enableRLS();

/** Sole durable state machine for every paid provider call. */
export const providerCallReservations = pgTable(
	"provider_call_reservations",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		provider: text("provider").notNull(),
		circuitKey: text("circuit_key").notNull(),
		ownerType: text("owner_type").notNull(),
		ownerId: text("owner_id").notNull(),
		workKey: text("work_key").notNull(),
		requestFingerprint: text("request_fingerprint").notNull(),
		requestMetadata: json("request_metadata").notNull(),
		workerId: text("worker_id").notNull(),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		submissionStartedAt: timestamp("submission_started_at", { withTimezone: true }),
		externalTaskId: text("external_task_id"),
		taskDeadlineAt: timestamp("task_deadline_at", { withTimezone: true }),
		resultPayload: json("result_payload"),
		attemptCount: integer("attempt_count").default(0).notNull(),
		lastError: text("last_error"),
		releasedAt: timestamp("released_at", { withTimezone: true }),
		releaseReason: text("release_reason"),
		releasedBy: text("released_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => ({
		activeIdx: index("provider_call_reservations_active_idx").on(
			table.provider,
			table.releasedAt,
			table.leaseExpiresAt,
		),
		deadlineIdx: index("provider_call_reservations_deadline_idx").on(table.releasedAt, table.taskDeadlineAt),
		ownerIdx: index("provider_call_reservations_owner_idx").on(table.ownerType, table.ownerId),
		workIdx: uniqueIndex("provider_call_reservations_work_idx").on(table.ownerType, table.ownerId, table.workKey),
	}),
).enableRLS();

export interface ReportProviderPlanSnapshot {
	version: 1;
	candidatePromptCount: number;
	targets: Array<{
		config: {
			model: string;
			provider: string;
			version?: string;
			webSearch: boolean;
		};
		runs: number;
	}>;
}

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
		providerPlan: json("provider_plan").$type<ReportProviderPlanSnapshot>(),
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
