-- Migration: Rename modelGroup to engine (enum -> text), add provider column, migrate values
-- This migration supports the multi-provider scraping architecture.
--
-- NOTE: The original Drizzle schema used `modelGroup` (camelCase) as the column name
-- since no explicit column name was provided to the pgEnum() call.

-- Step 1: prompt_runs — convert modelGroup enum to text, rename to engine, add provider column
ALTER TABLE "prompt_runs" ALTER COLUMN "modelGroup" TYPE text USING "modelGroup"::text;
ALTER TABLE "prompt_runs" RENAME COLUMN "modelGroup" TO "engine";
ALTER TABLE "prompt_runs" ADD COLUMN "provider" text;

-- Step 2: citations — same rename
ALTER TABLE "citations" ALTER COLUMN "modelGroup" TYPE text USING "modelGroup"::text;
ALTER TABLE "citations" RENAME COLUMN "modelGroup" TO "engine";

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

-- Step 8: Create composite index for engine-based queries
CREATE INDEX IF NOT EXISTS "prompt_runs_engine_created_at_idx" ON "prompt_runs" ("engine", "created_at");
