-- Additive cloud tracking control plane. No legacy scheduler or tracking
-- columns are changed, and no rollout rows are inserted by this migration.
SET lock_timeout = '5s';
SET statement_timeout = '15min';--> statement-breakpoint

CREATE TYPE "public"."billing_subscription_item_type" AS ENUM('base_plan', 'premium_addon', 'custom');--> statement-breakpoint
CREATE TYPE "public"."prompt_target_assignment_source" AS ENUM('brand_selection', 'premium', 'custom');--> statement-breakpoint
CREATE TYPE "public"."scheduler_rollout_mode" AS ENUM('legacy', 'shadow', 'v2');--> statement-breakpoint
CREATE TYPE "public"."stripe_webhook_status" AS ENUM('pending', 'processing', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."target_selection_source" AS ENUM('plan_default', 'user', 'operator');--> statement-breakpoint
CREATE TYPE "public"."tracking_attempt_status" AS ENUM('reserved', 'started', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."tracking_occurrence_status" AS ENUM('pending', 'enqueued', 'running', 'succeeded', 'partial', 'failed', 'canceled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."tracking_task_status" AS ENUM('pending', 'enqueued', 'running', 'succeeded', 'failed', 'canceled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."tracking_usage_class" AS ENUM('standard', 'premium', 'custom');--> statement-breakpoint
CREATE TABLE "brand_scheduler_rollouts" (
	"brand_id" text PRIMARY KEY NOT NULL,
	"mode" "scheduler_rollout_mode" DEFAULT 'legacy' NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"shadow_started_at" timestamp with time zone,
	"cutover_at" timestamp with time zone,
	"last_rolled_back_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_scheduler_rollouts_generation_check" CHECK ("brand_scheduler_rollouts"."generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "brand_scheduler_rollouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brand_target_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"target_key" text NOT NULL,
	"requested_cadence_minutes" integer,
	"source" "target_selection_source" DEFAULT 'user' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_target_selections_requested_cadence_check" CHECK ("brand_target_selections"."requested_cadence_minutes" IS NULL OR "brand_target_selections"."requested_cadence_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "brand_target_selections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_billing_subscription_items" (
	"stripe_subscription_item_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"stripe_price_lookup_key" text,
	"type" "billing_subscription_item_type" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source_event_id" text,
	"source_event_created_at" timestamp with time zone,
	"source_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_billing_subscription_items_quantity_check" CHECK ("organization_billing_subscription_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "organization_billing_subscription_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_billing_subscriptions" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"status" text NOT NULL,
	"base_plan_key" text,
	"billing_interval" text,
	"currency" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"source_event_id" text,
	"source_event_created_at" timestamp with time zone,
	"source_snapshot" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_billing_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_entitlement_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"revision" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"entitlements" jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"reason" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_entitlement_overrides_revision_check" CHECK ("organization_entitlement_overrides"."revision" > 0),
	CONSTRAINT "organization_entitlement_overrides_schema_version_check" CHECK ("organization_entitlement_overrides"."schema_version" > 0),
	CONSTRAINT "organization_entitlement_overrides_effective_window_check" CHECK ("organization_entitlement_overrides"."effective_until" IS NULL OR "organization_entitlement_overrides"."effective_until" > "organization_entitlement_overrides"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "organization_entitlement_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prompt_target_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"brand_target_selection_id" uuid,
	"target_key" text NOT NULL,
	"source" "prompt_target_assignment_source" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"api_version" text,
	"livemode" boolean NOT NULL,
	"stripe_created_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "stripe_webhook_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_attempt_count_check" CHECK ("stripe_webhook_events"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tracking_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"generation" integer NOT NULL,
	"policy_version" integer NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"status" "tracking_occurrence_status" DEFAULT 'pending' NOT NULL,
	"expected_task_count" smallint NOT NULL,
	"materialized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_occurrences_generation_check" CHECK ("tracking_occurrences"."generation" > 0),
	CONSTRAINT "tracking_occurrences_policy_version_check" CHECK ("tracking_occurrences"."policy_version" > 0),
	CONSTRAINT "tracking_occurrences_task_count_check" CHECK ("tracking_occurrences"."expected_task_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "tracking_occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tracking_provider_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"target_key" text NOT NULL,
	"usage_class" "tracking_usage_class" NOT NULL,
	"attempt_number" smallint NOT NULL,
	"status" "tracking_attempt_status" DEFAULT 'reserved' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text,
	"web_search_enabled" boolean NOT NULL,
	"usage_units" integer DEFAULT 1 NOT NULL,
	"counts_toward_limit" boolean DEFAULT true NOT NULL,
	"quota_period_start" timestamp with time zone,
	"quota_period_end" timestamp with time zone,
	"provider_request_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"web_search_requests" integer,
	"cost_microusd" bigint,
	"error_code" text,
	"error_message" text,
	"prompt_run_id" uuid,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_provider_attempts_attempt_number_check" CHECK ("tracking_provider_attempts"."attempt_number" > 0),
	CONSTRAINT "tracking_provider_attempts_usage_units_check" CHECK ("tracking_provider_attempts"."usage_units" >= 0),
	CONSTRAINT "tracking_provider_attempts_quota_window_check" CHECK ("tracking_provider_attempts"."quota_period_end" IS NULL OR ("tracking_provider_attempts"."quota_period_start" IS NOT NULL AND "tracking_provider_attempts"."quota_period_end" > "tracking_provider_attempts"."quota_period_start")),
	CONSTRAINT "tracking_provider_attempts_input_tokens_check" CHECK ("tracking_provider_attempts"."input_tokens" IS NULL OR "tracking_provider_attempts"."input_tokens" >= 0),
	CONSTRAINT "tracking_provider_attempts_output_tokens_check" CHECK ("tracking_provider_attempts"."output_tokens" IS NULL OR "tracking_provider_attempts"."output_tokens" >= 0),
	CONSTRAINT "tracking_provider_attempts_web_search_requests_check" CHECK ("tracking_provider_attempts"."web_search_requests" IS NULL OR "tracking_provider_attempts"."web_search_requests" >= 0),
	CONSTRAINT "tracking_provider_attempts_cost_check" CHECK ("tracking_provider_attempts"."cost_microusd" IS NULL OR "tracking_provider_attempts"."cost_microusd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tracking_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_target_assignment_id" uuid NOT NULL,
	"target_key" text NOT NULL,
	"cadence_minutes" integer NOT NULL,
	"samples_per_occurrence" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_due_at" timestamp with time zone,
	"generation" integer NOT NULL,
	"policy_version" integer NOT NULL,
	"last_materialized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_schedules_cadence_check" CHECK ("tracking_schedules"."cadence_minutes" > 0),
	CONSTRAINT "tracking_schedules_samples_check" CHECK ("tracking_schedules"."samples_per_occurrence" > 0),
	CONSTRAINT "tracking_schedules_generation_check" CHECK ("tracking_schedules"."generation" > 0),
	CONSTRAINT "tracking_schedules_policy_version_check" CHECK ("tracking_schedules"."policy_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "tracking_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tracking_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"sample_index" smallint NOT NULL,
	"target_key" text NOT NULL,
	"status" "tracking_task_status" DEFAULT 'pending' NOT NULL,
	"queue_name" text,
	"pg_boss_job_id" uuid,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"prompt_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_tasks_sample_index_check" CHECK ("tracking_tasks"."sample_index" >= 0),
	CONSTRAINT "tracking_tasks_attempt_count_check" CHECK ("tracking_tasks"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tracking_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_scheduler_rollouts" ADD CONSTRAINT "brand_scheduler_rollouts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_target_selections" ADD CONSTRAINT "brand_target_selections_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_target_selections" ADD CONSTRAINT "brand_target_selections_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_billing_subscription_items" ADD CONSTRAINT "organization_billing_subscription_items_organization_id_organization_billing_subscriptions_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization_billing_subscriptions"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_billing_subscription_items" ADD CONSTRAINT "organization_billing_subscription_items_source_event_id_stripe_webhook_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."stripe_webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_billing_subscriptions" ADD CONSTRAINT "organization_billing_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_billing_subscriptions" ADD CONSTRAINT "organization_billing_subscriptions_source_event_id_stripe_webhook_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."stripe_webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_entitlement_overrides" ADD CONSTRAINT "organization_entitlement_overrides_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_entitlement_overrides" ADD CONSTRAINT "organization_entitlement_overrides_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" ADD CONSTRAINT "prompt_target_assignments_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" ADD CONSTRAINT "prompt_target_assignments_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" ADD CONSTRAINT "prompt_target_assignments_brand_target_selection_id_brand_target_selections_id_fk" FOREIGN KEY ("brand_target_selection_id") REFERENCES "public"."brand_target_selections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_occurrences" ADD CONSTRAINT "tracking_occurrences_schedule_id_tracking_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."tracking_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_task_id_tracking_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tracking_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_prompt_run_id_prompt_runs_id_fk" FOREIGN KEY ("prompt_run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_schedules" ADD CONSTRAINT "tracking_schedules_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_schedules" ADD CONSTRAINT "tracking_schedules_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_schedules" ADD CONSTRAINT "tracking_schedules_prompt_target_assignment_id_prompt_target_assignments_id_fk" FOREIGN KEY ("prompt_target_assignment_id") REFERENCES "public"."prompt_target_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_tasks" ADD CONSTRAINT "tracking_tasks_occurrence_id_tracking_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."tracking_occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_tasks" ADD CONSTRAINT "tracking_tasks_prompt_run_id_prompt_runs_id_fk" FOREIGN KEY ("prompt_run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_scheduler_rollouts_mode_idx" ON "brand_scheduler_rollouts" USING btree ("mode");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_target_selections_brand_target_uidx" ON "brand_target_selections" USING btree ("brand_id","target_key");--> statement-breakpoint
CREATE INDEX "brand_target_selections_brand_enabled_idx" ON "brand_target_selections" USING btree ("brand_id","enabled");--> statement-breakpoint
CREATE INDEX "organization_billing_subscription_items_org_idx" ON "organization_billing_subscription_items" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_billing_subscription_items_active_base_uidx" ON "organization_billing_subscription_items" USING btree ("organization_id") WHERE "organization_billing_subscription_items"."active" = true AND "organization_billing_subscription_items"."type" = 'base_plan';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_billing_subscription_items_active_premium_uidx" ON "organization_billing_subscription_items" USING btree ("organization_id") WHERE "organization_billing_subscription_items"."active" = true AND "organization_billing_subscription_items"."type" = 'premium_addon';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_billing_subscriptions_stripe_subscription_uidx" ON "organization_billing_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_billing_subscriptions_stripe_customer_uidx" ON "organization_billing_subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "organization_billing_subscriptions_status_idx" ON "organization_billing_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "organization_billing_subscriptions_period_end_idx" ON "organization_billing_subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_entitlement_overrides_org_revision_uidx" ON "organization_entitlement_overrides" USING btree ("organization_id","revision");--> statement-breakpoint
CREATE INDEX "organization_entitlement_overrides_resolution_idx" ON "organization_entitlement_overrides" USING btree ("organization_id","effective_from","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_target_assignments_prompt_target_uidx" ON "prompt_target_assignments" USING btree ("prompt_id","target_key");--> statement-breakpoint
CREATE INDEX "prompt_target_assignments_brand_enabled_idx" ON "prompt_target_assignments" USING btree ("brand_id","enabled");--> statement-breakpoint
CREATE INDEX "prompt_target_assignments_selection_idx" ON "prompt_target_assignments" USING btree ("brand_target_selection_id");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_claim_idx" ON "stripe_webhook_events" USING btree ("status","next_attempt_at","received_at");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_type_created_idx" ON "stripe_webhook_events" USING btree ("type","stripe_created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_occurrences_schedule_due_uidx" ON "tracking_occurrences" USING btree ("schedule_id","due_at");--> statement-breakpoint
CREATE INDEX "tracking_occurrences_status_due_idx" ON "tracking_occurrences" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_provider_attempts_task_attempt_uidx" ON "tracking_provider_attempts" USING btree ("task_id","attempt_number");--> statement-breakpoint
CREATE INDEX "tracking_provider_attempts_org_quota_idx" ON "tracking_provider_attempts" USING btree ("organization_id","usage_class","quota_period_start") WHERE "tracking_provider_attempts"."counts_toward_limit" = true;--> statement-breakpoint
CREATE INDEX "tracking_provider_attempts_brand_created_idx" ON "tracking_provider_attempts" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "tracking_provider_attempts_prompt_created_idx" ON "tracking_provider_attempts" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE INDEX "tracking_provider_attempts_provider_request_idx" ON "tracking_provider_attempts" USING btree ("provider","provider_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_schedules_prompt_target_uidx" ON "tracking_schedules" USING btree ("prompt_id","target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_schedules_assignment_uidx" ON "tracking_schedules" USING btree ("prompt_target_assignment_id");--> statement-breakpoint
CREATE INDEX "tracking_schedules_due_idx" ON "tracking_schedules" USING btree ("active","next_due_at");--> statement-breakpoint
CREATE INDEX "tracking_schedules_brand_generation_idx" ON "tracking_schedules" USING btree ("brand_id","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_tasks_occurrence_sample_uidx" ON "tracking_tasks" USING btree ("occurrence_id","sample_index");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_tasks_pg_boss_job_uidx" ON "tracking_tasks" USING btree ("pg_boss_job_id");--> statement-breakpoint
CREATE INDEX "tracking_tasks_claim_idx" ON "tracking_tasks" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "tracking_tasks_target_idx" ON "tracking_tasks" USING btree ("target_key");--> statement-breakpoint
-- Better Auth expects one membership per user and organization. Older installs
-- did not enforce that invariant, so retain the highest-privilege, earliest
-- membership deterministically before adding the index. The bounded table lock
-- closes the race between cleanup and index creation while allowing reads.
LOCK TABLE "member" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
WITH ranked_members AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "organization_id", "user_id"
			ORDER BY
				CASE "role"
					WHEN 'owner' THEN 0
					WHEN 'admin' THEN 1
					WHEN 'member' THEN 2
					ELSE 3
				END,
				"created_at" ASC,
				"id" ASC
		) AS duplicate_rank
	FROM "member"
)
DELETE FROM "member"
USING ranked_members
WHERE "member"."id" = ranked_members."id"
	AND ranked_members.duplicate_rank > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "member_organizationId_userId_uidx" ON "member" USING btree ("organization_id","user_id");
