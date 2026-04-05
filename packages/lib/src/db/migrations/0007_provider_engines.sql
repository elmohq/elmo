-- Migration: Multi-provider scraping support
--
-- Renames the model_group concept to "model" (the AI product being tracked),
-- renames the model column to "version" (specific model version),
-- and adds a "provider" column (how the model was reached).
--
-- NOTE: The original Drizzle schema used camelCase column names (modelGroup, not model_group).

-- Step 1: prompt_runs — rename modelGroup (enum) to model (text), rename model to version, add provider
ALTER TABLE "prompt_runs" RENAME COLUMN "model" TO "version";
ALTER TABLE "prompt_runs" ALTER COLUMN "modelGroup" TYPE text USING "modelGroup"::text;
ALTER TABLE "prompt_runs" RENAME COLUMN "modelGroup" TO "model";
ALTER TABLE "prompt_runs" ADD COLUMN "provider" text;

-- Step 2: citations — rename modelGroup to model
ALTER TABLE "citations" ALTER COLUMN "modelGroup" TYPE text USING "modelGroup"::text;
ALTER TABLE "citations" RENAME COLUMN "modelGroup" TO "model";

-- Step 3: Drop the now-unused enum type
DROP TYPE IF EXISTS "model_groups";

-- Step 4: Migrate model values from old names to new names
UPDATE "prompt_runs" SET "model" = CASE
  WHEN "model" = 'openai' THEN 'chatgpt'
  WHEN "model" = 'anthropic' THEN 'claude'
  WHEN "model" = 'google' THEN 'google-ai-mode'
  ELSE "model"
END;

UPDATE "citations" SET "model" = CASE
  WHEN "model" = 'openai' THEN 'chatgpt'
  WHEN "model" = 'anthropic' THEN 'claude'
  WHEN "model" = 'google' THEN 'google-ai-mode'
  ELSE "model"
END;

-- Step 5: Backfill provider for existing data
UPDATE "prompt_runs" SET "provider" = CASE
  WHEN "model" = 'chatgpt' THEN 'direct'
  WHEN "model" = 'claude' THEN 'direct'
  WHEN "model" = 'google-ai-mode' THEN 'dataforseo'
  ELSE NULL
END
WHERE "provider" IS NULL;

-- Step 6: Add enabled_models column to brands for per-brand model filtering
ALTER TABLE "brands" ADD COLUMN "enabled_models" text[];

-- Step 7: Create indexes
CREATE INDEX IF NOT EXISTS "prompt_runs_provider_idx" ON "prompt_runs" ("provider");
CREATE INDEX IF NOT EXISTS "prompt_runs_model_created_at_idx" ON "prompt_runs" ("model", "created_at");
