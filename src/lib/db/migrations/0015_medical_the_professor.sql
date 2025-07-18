ALTER TABLE "prompt_runs" ALTER COLUMN "web_queries" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "prompt_runs" ALTER COLUMN "web_queries" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_runs" ALTER COLUMN "competitors_mentioned" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "prompt_runs" ALTER COLUMN "competitors_mentioned" SET NOT NULL;