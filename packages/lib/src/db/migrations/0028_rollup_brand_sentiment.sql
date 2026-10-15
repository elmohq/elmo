ALTER TABLE "rollup_prompt_runs" ADD COLUMN "uncertain_mention_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "positive_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "neutral_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "negative_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "mixed_runs" integer DEFAULT 0 NOT NULL;