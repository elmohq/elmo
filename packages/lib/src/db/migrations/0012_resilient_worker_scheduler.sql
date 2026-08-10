CREATE TYPE "public"."prompt_execution_run_status" AS ENUM('pending', 'running', 'processing', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."prompt_execution_status" AS ENUM('running', 'succeeded', 'partial', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."prompt_execution_trigger" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TYPE "public"."provider_circuit_state" AS ENUM('closed', 'open', 'half_open');--> statement-breakpoint
CREATE TABLE "prompt_execution_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"prompt_run_id" uuid,
	"target_index" smallint NOT NULL,
	"run_index" smallint NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"version" text,
	"web_search_enabled" boolean NOT NULL,
	"status" "prompt_execution_run_status" DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"worker_id" text,
	"lease_expires_at" timestamp with time zone,
	"local_attempts" integer DEFAULT 0 NOT NULL,
	"failure_kind" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_execution_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prompt_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"context_payload" json,
	"trigger" "prompt_execution_trigger" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"not_after" timestamp with time zone NOT NULL,
	"status" "prompt_execution_status" DEFAULT 'running' NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"succeeded_runs" integer DEFAULT 0 NOT NULL,
	"failed_runs" integer DEFAULT 0 NOT NULL,
	"skipped_runs" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prompt_schedules" (
	"prompt_id" uuid PRIMARY KEY NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"run_requested_at" timestamp with time zone,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"admission_paused_until" timestamp with time zone,
	"pause_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "provider_call_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"circuit_key" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"work_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"request_metadata" json NOT NULL,
	"worker_id" text NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"submission_started_at" timestamp with time zone,
	"external_task_id" text,
	"task_deadline_at" timestamp with time zone,
	"result_payload" json,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"released_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "provider_health" (
	"circuit_key" text PRIMARY KEY NOT NULL,
	"circuit_state" "provider_circuit_state" DEFAULT 'closed' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone,
	"reopen_at" timestamp with time zone,
	"probe_run_id" uuid,
	"last_failure_kind" text,
	"last_error" text,
	"last_failure_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_health" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "worker_scheduler_control" (
	"id" text PRIMARY KEY NOT NULL,
	"admission_closed_at" timestamp with time zone,
	"cutover_completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "worker_scheduler_control" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "provider_plan" json;--> statement-breakpoint
ALTER TABLE "prompt_execution_runs" ADD CONSTRAINT "prompt_execution_runs_execution_id_prompt_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."prompt_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_execution_runs" ADD CONSTRAINT "prompt_execution_runs_prompt_run_id_prompt_runs_id_fk" FOREIGN KEY ("prompt_run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_schedules" ADD CONSTRAINT "prompt_schedules_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_execution_runs_identity_idx" ON "prompt_execution_runs" USING btree ("execution_id","target_index","run_index");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_execution_runs_prompt_run_idx" ON "prompt_execution_runs" USING btree ("prompt_run_id");--> statement-breakpoint
CREATE INDEX "prompt_execution_runs_claim_idx" ON "prompt_execution_runs" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_executions_identity_idx" ON "prompt_executions" USING btree ("prompt_id","trigger","scheduled_for");--> statement-breakpoint
CREATE INDEX "prompt_executions_prompt_created_idx" ON "prompt_executions" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_executions_status_deadline_idx" ON "prompt_executions" USING btree ("status","not_after");--> statement-breakpoint
CREATE INDEX "prompt_schedules_due_idx" ON "prompt_schedules" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "prompt_schedules_request_idx" ON "prompt_schedules" USING btree ("run_requested_at");--> statement-breakpoint
CREATE INDEX "prompt_schedules_lease_idx" ON "prompt_schedules" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "provider_call_reservations_active_idx" ON "provider_call_reservations" USING btree ("provider","released_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "provider_call_reservations_deadline_idx" ON "provider_call_reservations" USING btree ("released_at","task_deadline_at");--> statement-breakpoint
CREATE INDEX "provider_call_reservations_owner_idx" ON "provider_call_reservations" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_call_reservations_work_idx" ON "provider_call_reservations" USING btree ("owner_type","owner_id","work_key");
--> statement-breakpoint
INSERT INTO "worker_scheduler_control" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_legacy_paid_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	admission_closed_at timestamptz;
	cutover_completed_at timestamptz;
BEGIN
	IF TG_OP = 'INSERT' AND NEW.name IN ('generate-report-v2', 'analyze-brand-v2') THEN
		SELECT control.cutover_completed_at INTO cutover_completed_at
		FROM public.worker_scheduler_control control
		WHERE control.id = 'global';

		IF cutover_completed_at IS NULL THEN
			SELECT control.cutover_completed_at INTO cutover_completed_at
			FROM public.worker_scheduler_control control
			WHERE control.id = 'global'
			FOR SHARE;
			IF cutover_completed_at IS NULL THEN
				RAISE EXCEPTION 'durable paid-work cutover is not complete; retry this enqueue'
					USING ERRCODE = '55000';
			END IF;
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.name IN ('process-prompt', 'generate-report', 'analyze-brand') THEN
		SELECT control.admission_closed_at INTO admission_closed_at
		FROM public.worker_scheduler_control control
		WHERE control.id = 'global';

		IF admission_closed_at IS NULL THEN
			SELECT control.admission_closed_at INTO admission_closed_at
			FROM public.worker_scheduler_control control
			WHERE control.id = 'global'
			FOR SHARE;
		END IF;

		IF admission_closed_at IS NOT NULL THEN
			IF TG_OP = 'INSERT' AND NEW.state NOT IN ('retry', 'failed') THEN
				RAISE EXCEPTION 'legacy paid-work admission is permanently closed' USING ERRCODE = '55000';
			ELSIF TG_OP = 'UPDATE' AND NEW.state = 'active' AND OLD.state IS DISTINCT FROM 'active' THEN
				RETURN NULL;
			END IF;
		END IF;
	END IF;
	RETURN NEW;
END;
$function$;--> statement-breakpoint
DO $block$
BEGIN
	IF to_regclass('pgboss.job') IS NOT NULL THEN
		EXECUTE 'DROP TRIGGER IF EXISTS reject_legacy_paid_admission ON pgboss.job';
		EXECUTE 'CREATE TRIGGER reject_legacy_paid_admission
			BEFORE INSERT OR UPDATE ON pgboss.job
			FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_paid_admission()';
	END IF;
END;
$block$;
