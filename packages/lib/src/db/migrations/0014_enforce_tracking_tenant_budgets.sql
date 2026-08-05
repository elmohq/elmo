-- Tighten the v2 tracking schema before any rollout rows are created. The
-- tracking tables introduced by 0012 remain empty until an operator explicitly
-- moves a brand from legacy to shadow mode.
SET lock_timeout = '5s';
SET statement_timeout = '15min';--> statement-breakpoint

CREATE TABLE "tracking_usage_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"usage_class" "tracking_usage_class" NOT NULL,
	"quota_key" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"limit_units" integer NOT NULL,
	"used_units" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_usage_buckets_window_check" CHECK ("tracking_usage_buckets"."period_end" > "tracking_usage_buckets"."period_start"),
	CONSTRAINT "tracking_usage_buckets_limit_check" CHECK ("tracking_usage_buckets"."limit_units" >= 0),
	CONSTRAINT "tracking_usage_buckets_used_check" CHECK ("tracking_usage_buckets"."used_units" >= 0 AND "tracking_usage_buckets"."used_units" <= "tracking_usage_buckets"."limit_units")
);
--> statement-breakpoint
ALTER TABLE "tracking_usage_buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" DROP CONSTRAINT "prompt_target_assignments_prompt_id_prompts_id_fk";
--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" DROP CONSTRAINT "prompt_target_assignments_brand_target_selection_id_brand_target_selections_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_occurrences" DROP CONSTRAINT "tracking_occurrences_schedule_id_tracking_schedules_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" DROP CONSTRAINT "tracking_provider_attempts_task_id_tracking_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" DROP CONSTRAINT "tracking_provider_attempts_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" DROP CONSTRAINT "tracking_provider_attempts_brand_id_brands_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" DROP CONSTRAINT "tracking_provider_attempts_prompt_id_prompts_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_schedules" DROP CONSTRAINT "tracking_schedules_prompt_target_assignment_id_prompt_target_assignments_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_tasks" DROP CONSTRAINT "tracking_tasks_occurrence_id_tracking_occurrences_id_fk";
--> statement-breakpoint
ALTER TABLE "tracking_occurrences" ADD COLUMN "brand_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_occurrences" ADD COLUMN "prompt_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_occurrences" ADD COLUMN "target_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD COLUMN "usage_bucket_id" uuid;--> statement-breakpoint
ALTER TABLE "tracking_tasks" ADD COLUMN "brand_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_tasks" ADD COLUMN "prompt_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_usage_buckets" ADD CONSTRAINT "tracking_usage_buckets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_usage_buckets_period_uidx" ON "tracking_usage_buckets" USING btree ("organization_id","usage_class","quota_key","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_usage_buckets_attempt_identity_uidx" ON "tracking_usage_buckets" USING btree ("id","organization_id","usage_class","period_start","period_end");--> statement-breakpoint
CREATE INDEX "tracking_usage_buckets_expiry_idx" ON "tracking_usage_buckets" USING btree ("organization_id","period_end");--> statement-breakpoint
-- PostgreSQL requires referenced composite identities to be unique before the
-- foreign keys are added. Each leading id is already a primary key, so these
-- indexes cannot reject existing legacy data.
CREATE UNIQUE INDEX "brand_target_selections_identity_uidx" ON "brand_target_selections" USING btree ("id","brand_id","target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_id_organization_id_uidx" ON "brands" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_target_assignments_identity_uidx" ON "prompt_target_assignments" USING btree ("id","brand_id","prompt_id","target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "prompts_id_brand_id_uidx" ON "prompts" USING btree ("id","brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_occurrences_identity_uidx" ON "tracking_occurrences" USING btree ("id","brand_id","prompt_id","target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_schedules_identity_uidx" ON "tracking_schedules" USING btree ("id","brand_id","prompt_id","target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_tasks_identity_uidx" ON "tracking_tasks" USING btree ("id","brand_id","prompt_id","target_key");--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" ADD CONSTRAINT "prompt_target_assignments_prompt_brand_fk" FOREIGN KEY ("prompt_id","brand_id") REFERENCES "public"."prompts"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" ADD CONSTRAINT "prompt_target_assignments_selection_identity_fk" FOREIGN KEY ("brand_target_selection_id","brand_id","target_key") REFERENCES "public"."brand_target_selections"("id","brand_id","target_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_occurrences" ADD CONSTRAINT "tracking_occurrences_schedule_identity_fk" FOREIGN KEY ("schedule_id","brand_id","prompt_id","target_key") REFERENCES "public"."tracking_schedules"("id","brand_id","prompt_id","target_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_task_identity_fk" FOREIGN KEY ("task_id","brand_id","prompt_id","target_key") REFERENCES "public"."tracking_tasks"("id","brand_id","prompt_id","target_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_brand_organization_fk" FOREIGN KEY ("brand_id","organization_id") REFERENCES "public"."brands"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_prompt_brand_fk" FOREIGN KEY ("prompt_id","brand_id") REFERENCES "public"."prompts"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_usage_bucket_identity_fk" FOREIGN KEY ("usage_bucket_id","organization_id","usage_class","quota_period_start","quota_period_end") REFERENCES "public"."tracking_usage_buckets"("id","organization_id","usage_class","period_start","period_end") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_schedules" ADD CONSTRAINT "tracking_schedules_assignment_identity_fk" FOREIGN KEY ("prompt_target_assignment_id","brand_id","prompt_id","target_key") REFERENCES "public"."prompt_target_assignments"("id","brand_id","prompt_id","target_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_tasks" ADD CONSTRAINT "tracking_tasks_occurrence_identity_fk" FOREIGN KEY ("occurrence_id","brand_id","prompt_id","target_key") REFERENCES "public"."tracking_occurrences"("id","brand_id","prompt_id","target_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracking_occurrences_brand_due_idx" ON "tracking_occurrences" USING btree ("brand_id","due_at");--> statement-breakpoint
CREATE INDEX "tracking_provider_attempts_usage_bucket_idx" ON "tracking_provider_attempts" USING btree ("usage_bucket_id");--> statement-breakpoint
ALTER TABLE "prompt_target_assignments" ADD CONSTRAINT "prompt_target_assignments_selection_source_check" CHECK (("prompt_target_assignments"."source" = 'brand_selection' AND "prompt_target_assignments"."brand_target_selection_id" IS NOT NULL) OR ("prompt_target_assignments"."source" <> 'brand_selection' AND "prompt_target_assignments"."brand_target_selection_id" IS NULL));--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_counted_bucket_check" CHECK ("tracking_provider_attempts"."counts_toward_limit" = false OR ("tracking_provider_attempts"."usage_bucket_id" IS NOT NULL AND "tracking_provider_attempts"."quota_period_start" IS NOT NULL AND "tracking_provider_attempts"."quota_period_end" IS NOT NULL));
