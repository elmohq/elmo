CREATE TYPE "public"."prompt_execution_run_status" AS ENUM('pending', 'running', 'processing', 'succeeded', 'failed', 'abandoned', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."prompt_execution_status" AS ENUM('pending', 'running', 'succeeded', 'partial', 'failed', 'abandoned', 'skipped');--> statement-breakpoint
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
	"external_task_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"result_payload" json,
	"failure_kind" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"provider_submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_execution_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prompt_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"trigger" "prompt_execution_trigger" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"not_after" timestamp with time zone NOT NULL,
	"status" "prompt_execution_status" DEFAULT 'pending' NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"succeeded_runs" integer DEFAULT 0 NOT NULL,
	"failed_runs" integer DEFAULT 0 NOT NULL,
	"skipped_runs" integer DEFAULT 0 NOT NULL,
	"abandoned_runs" integer DEFAULT 0 NOT NULL,
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
	"last_started_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"last_execution_status" "prompt_execution_status",
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "provider_health" (
	"provider" text PRIMARY KEY NOT NULL,
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
ALTER TABLE "prompt_execution_runs" ADD CONSTRAINT "prompt_execution_runs_execution_id_prompt_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."prompt_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_execution_runs" ADD CONSTRAINT "prompt_execution_runs_prompt_run_id_prompt_runs_id_fk" FOREIGN KEY ("prompt_run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_executions" ADD CONSTRAINT "prompt_executions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_schedules" ADD CONSTRAINT "prompt_schedules_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_execution_runs_identity_idx" ON "prompt_execution_runs" USING btree ("execution_id","target_index","run_index");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_execution_runs_prompt_run_idx" ON "prompt_execution_runs" USING btree ("prompt_run_id");--> statement-breakpoint
CREATE INDEX "prompt_execution_runs_claim_idx" ON "prompt_execution_runs" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "prompt_execution_runs_provider_active_idx" ON "prompt_execution_runs" USING btree ("provider","status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_executions_identity_idx" ON "prompt_executions" USING btree ("prompt_id","trigger","scheduled_for");--> statement-breakpoint
CREATE INDEX "prompt_executions_prompt_created_idx" ON "prompt_executions" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_executions_status_deadline_idx" ON "prompt_executions" USING btree ("status","not_after");--> statement-breakpoint
CREATE INDEX "prompt_schedules_due_idx" ON "prompt_schedules" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "prompt_schedules_request_idx" ON "prompt_schedules" USING btree ("run_requested_at");--> statement-breakpoint
CREATE INDEX "prompt_schedules_lease_idx" ON "prompt_schedules" USING btree ("lease_expires_at");
