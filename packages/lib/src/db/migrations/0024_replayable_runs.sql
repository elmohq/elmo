ALTER TABLE "brands" ADD COLUMN "analysis_versions" jsonb;--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "analysis_versions" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "extractor_version" integer;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "analysis_versions" jsonb DEFAULT '{}'::jsonb NOT NULL;
