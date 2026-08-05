-- Additive cloud retention storage plus nullable ownership/audit links on
-- existing tables. Bound lock acquisition so a busy legacy or whitelabel
-- deployment fails before cutover instead of waiting behind live traffic.
SET lock_timeout = '5s';
SET statement_timeout = '15min';--> statement-breakpoint

CREATE TYPE "public"."organization_data_retention_status" AS ENUM('scheduled', 'confirmed', 'purged', 'canceled');--> statement-breakpoint
CREATE TABLE "organization_data_retention_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"source_subscription_status" text NOT NULL,
	"source_subscription_ended_at" timestamp with time zone NOT NULL,
	"eligible_at" timestamp with time zone NOT NULL,
	"source_subscription_synced_at" timestamp with time zone NOT NULL,
	"status" "organization_data_retention_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"check_attempt_count" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"purge_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_data_retention_runs_eligibility_check" CHECK ("organization_data_retention_runs"."eligible_at" = "organization_data_retention_runs"."source_subscription_ended_at" + INTERVAL '1440 hours'),
	CONSTRAINT "organization_data_retention_runs_source_status_check" CHECK ("organization_data_retention_runs"."source_subscription_status" IN ('canceled', 'incomplete_expired')),
	CONSTRAINT "organization_data_retention_runs_attempt_count_check" CHECK ("organization_data_retention_runs"."check_attempt_count" >= 0),
	CONSTRAINT "organization_data_retention_runs_state_check" CHECK ((
				("organization_data_retention_runs"."status" = 'scheduled' AND "organization_data_retention_runs"."confirmed_at" IS NULL AND "organization_data_retention_runs"."purge_after" IS NULL AND "organization_data_retention_runs"."purged_at" IS NULL AND "organization_data_retention_runs"."canceled_at" IS NULL AND "organization_data_retention_runs"."cancel_reason" IS NULL AND "organization_data_retention_runs"."purge_summary" IS NULL)
				OR ("organization_data_retention_runs"."status" = 'confirmed' AND "organization_data_retention_runs"."confirmed_at" IS NOT NULL AND "organization_data_retention_runs"."purge_after" IS NOT NULL AND "organization_data_retention_runs"."purge_after" >= "organization_data_retention_runs"."eligible_at" AND "organization_data_retention_runs"."purge_after" > "organization_data_retention_runs"."confirmed_at" AND "organization_data_retention_runs"."purged_at" IS NULL AND "organization_data_retention_runs"."canceled_at" IS NULL AND "organization_data_retention_runs"."cancel_reason" IS NULL AND "organization_data_retention_runs"."purge_summary" IS NULL)
				OR ("organization_data_retention_runs"."status" = 'purged' AND "organization_data_retention_runs"."confirmed_at" IS NOT NULL AND "organization_data_retention_runs"."purge_after" IS NOT NULL AND "organization_data_retention_runs"."purge_after" >= "organization_data_retention_runs"."eligible_at" AND "organization_data_retention_runs"."purge_after" > "organization_data_retention_runs"."confirmed_at" AND "organization_data_retention_runs"."purged_at" IS NOT NULL AND "organization_data_retention_runs"."canceled_at" IS NULL AND "organization_data_retention_runs"."cancel_reason" IS NULL AND "organization_data_retention_runs"."purge_summary" IS NOT NULL)
				OR ("organization_data_retention_runs"."status" = 'canceled' AND "organization_data_retention_runs"."purged_at" IS NULL AND "organization_data_retention_runs"."canceled_at" IS NOT NULL AND "organization_data_retention_runs"."cancel_reason" IS NOT NULL AND "organization_data_retention_runs"."purge_summary" IS NULL)
			))
);
--> statement-breakpoint
ALTER TABLE "organization_data_retention_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ALTER COLUMN "brand_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ALTER COLUMN "prompt_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD COLUMN "retention_run_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_data_retention_runs" ADD CONSTRAINT "organization_data_retention_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_data_retention_runs_source_uidx" ON "organization_data_retention_runs" USING btree ("organization_id","stripe_subscription_id","source_subscription_ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_data_retention_runs_open_org_uidx" ON "organization_data_retention_runs" USING btree ("organization_id") WHERE "organization_data_retention_runs"."status" IN ('scheduled', 'confirmed');--> statement-breakpoint
CREATE INDEX "organization_data_retention_runs_due_idx" ON "organization_data_retention_runs" USING btree ("status","eligible_at");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_retention_run_id_organization_data_retention_runs_id_fk" FOREIGN KEY ("retention_run_id") REFERENCES "public"."organization_data_retention_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_organization_created_at_idx" ON "reports" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "tracking_provider_attempts" ADD CONSTRAINT "tracking_provider_attempts_retention_state_check" CHECK ((
				("tracking_provider_attempts"."retention_run_id" IS NULL AND "tracking_provider_attempts"."task_id" IS NOT NULL AND "tracking_provider_attempts"."brand_id" IS NOT NULL AND "tracking_provider_attempts"."prompt_id" IS NOT NULL)
				OR ("tracking_provider_attempts"."retention_run_id" IS NOT NULL AND "tracking_provider_attempts"."task_id" IS NULL AND "tracking_provider_attempts"."brand_id" IS NULL AND "tracking_provider_attempts"."prompt_id" IS NULL AND "tracking_provider_attempts"."prompt_run_id" IS NULL)
			));
