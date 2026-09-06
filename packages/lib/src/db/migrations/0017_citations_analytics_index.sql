-- Large deployments should build this CONCURRENTLY before running the migration,
-- so the CREATE below is a no-op. Applied directly it holds a SHARE lock on
-- citations for the whole build, blocking the worker's inserts.
--
-- Created before the old index is dropped so there is never a window without one.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '60min';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "citations_brand_created_analytics_idx" ON "citations" USING btree ("brand_id","created_at","url","domain","title","prompt_id","model","citation_index");
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_citations_brand_analytics";
--> statement-breakpoint
SET lock_timeout = DEFAULT;
--> statement-breakpoint
SET statement_timeout = DEFAULT;
