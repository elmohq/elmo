-- Migration: Rename model_group to engine (enum -> text), add provider column, migrate values
-- This migration supports the multi-provider scraping architecture.

-- Step 1: prompt_runs — convert model_group enum to text, rename to engine, add provider column
ALTER TABLE "prompt_runs" ALTER COLUMN "model_group" TYPE text USING "model_group"::text;
ALTER TABLE "prompt_runs" RENAME COLUMN "model_group" TO "engine";
ALTER TABLE "prompt_runs" ADD COLUMN "provider" text;

-- Step 2: citations — same rename
ALTER TABLE "citations" ALTER COLUMN "model_group" TYPE text USING "model_group"::text;
ALTER TABLE "citations" RENAME COLUMN "model_group" TO "engine";

-- Step 3: Drop the now-unused enum type
DROP TYPE IF EXISTS "model_groups";

-- Step 4: Migrate engine values from old names to new names
UPDATE "prompt_runs" SET "engine" = CASE
  WHEN "engine" = 'openai' THEN 'chatgpt'
  WHEN "engine" = 'anthropic' THEN 'claude'
  WHEN "engine" = 'google' THEN 'google-ai-mode'
  ELSE "engine"
END;

UPDATE "citations" SET "engine" = CASE
  WHEN "engine" = 'openai' THEN 'chatgpt'
  WHEN "engine" = 'anthropic' THEN 'claude'
  WHEN "engine" = 'google' THEN 'google-ai-mode'
  ELSE "engine"
END;

-- Step 5: Backfill provider for existing data
UPDATE "prompt_runs" SET "provider" = CASE
  WHEN "engine" = 'chatgpt' THEN 'direct'
  WHEN "engine" = 'claude' THEN 'direct'
  WHEN "engine" = 'google-ai-mode' THEN 'dataforseo'
  ELSE NULL
END
WHERE "provider" IS NULL;

-- Step 6: Add enabled_engines column to brands for per-brand engine filtering
ALTER TABLE "brands" ADD COLUMN "enabled_engines" text[];

-- Step 7: Create index on provider column for prompt_runs
CREATE INDEX IF NOT EXISTS "prompt_runs_provider_idx" ON "prompt_runs" ("provider");

-- Step 8: Create composite index replacing the old model_group-based one
-- (The old index prompt_runs_web_search_model_group_created_at_idx will auto-follow the column rename)
CREATE INDEX IF NOT EXISTS "prompt_runs_engine_created_at_idx" ON "prompt_runs" ("engine", "created_at");
