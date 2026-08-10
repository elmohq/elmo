ALTER TABLE "provider_health" RENAME COLUMN "provider" TO "circuit_key";--> statement-breakpoint
ALTER TABLE "prompt_executions" DROP CONSTRAINT "prompt_executions_prompt_id_prompts_id_fk";
--> statement-breakpoint
ALTER TABLE "prompt_execution_runs" ADD COLUMN "circuit_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_executions" ADD COLUMN "context_payload" json;--> statement-breakpoint
ALTER TABLE "prompt_schedules" ADD COLUMN "admission_paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prompt_schedules" ADD COLUMN "pause_reason" text;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "request_metadata" json;--> statement-breakpoint
ALTER TABLE "worker_scheduler_control" ADD COLUMN "legacy_prompt_drained_at" timestamp with time zone;