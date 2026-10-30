ALTER TABLE "rollup_competitor_mentions" ADD COLUMN "positive_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ADD COLUMN "neutral_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ADD COLUMN "negative_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ADD COLUMN "mixed_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ADD COLUMN "position_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ADD COLUMN "positioned_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "positive_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "neutral_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "negative_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "mixed_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "position_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ADD COLUMN "positioned_runs" integer DEFAULT 0 NOT NULL;