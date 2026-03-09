-- Phase 3: Constraints + covering indices (run AFTER backfill is complete)
--
-- Prerequisites:
--   SELECT count(*) FROM prompt_runs WHERE brand_id IS NULL;
--   Must return 0 before running this migration.

-- Lock in NOT NULL constraint on brand_id
ALTER TABLE "prompt_runs" ALTER COLUMN "brand_id" SET NOT NULL;

-- The following CREATE INDEX CONCURRENTLY statements cannot run inside
-- a transaction. We break out of drizzle's auto-opened transaction.
COMMIT;

-- Brand-scoped analytics (dashboard, visibility time series, prompts summary)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_prompt_runs_brand_analytics"
  ON "prompt_runs" ("brand_id", "created_at")
  INCLUDE ("prompt_id", "brand_mentioned", "modelGroup", "web_search_enabled", "competitors_mentioned");

-- Single-prompt analytics (covering index for index-only scans)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_prompt_runs_prompt_analytics"
  ON "prompt_runs" ("prompt_id", "created_at")
  INCLUDE ("brand_mentioned", "modelGroup", "web_search_enabled", "competitors_mentioned", "brand_id", "web_queries");

-- Admin queries (date-scoped full scans)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_prompt_runs_admin"
  ON "prompt_runs" ("created_at")
  INCLUDE ("brand_id");

-- Re-open transaction for drizzle's migration journal bookkeeping
BEGIN;
