DROP INDEX IF EXISTS "citations_brand_created_analytics_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "citations_domain_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cited_pages_domain_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "prompt_runs_web_search_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "prompt_runs_web_search_model_group_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "prompt_runs_provider_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "prompt_runs_model_created_at_idx";--> statement-breakpoint
CREATE INDEX "competitors_brand_id_idx" ON "competitors" USING btree ("brand_id");