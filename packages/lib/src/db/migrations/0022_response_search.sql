-- Large deployments should build both indexes CONCURRENTLY before running the
-- migration, so the CREATEs below are no-ops. Applied directly, the pending
-- index covers every existing run and holds a SHARE lock on prompt_runs for
-- the whole build, blocking the worker's inserts.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60min';
--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN IF NOT EXISTS "text_content" text;
--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_runs_search_vector_idx" ON "prompt_runs" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_runs_text_content_pending_idx" ON "prompt_runs" USING btree ("created_at") WHERE "prompt_runs"."text_content" IS NULL;
--> statement-breakpoint
SET lock_timeout = DEFAULT;
--> statement-breakpoint
SET statement_timeout = DEFAULT;
