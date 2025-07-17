ALTER TABLE "prompt_runs" ADD COLUMN "brand_mentioned" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "competitors_mentioned" text[];--> statement-breakpoint
ALTER TABLE "prompt_runs" DROP COLUMN "summary";