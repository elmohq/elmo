ALTER TABLE "rollup_competitor_mentions" ALTER COLUMN "positive_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ALTER COLUMN "neutral_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ALTER COLUMN "negative_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ALTER COLUMN "mixed_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ALTER COLUMN "position_sum" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ALTER COLUMN "positioned_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ALTER COLUMN "positive_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ALTER COLUMN "neutral_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ALTER COLUMN "negative_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ALTER COLUMN "mixed_runs" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ALTER COLUMN "position_sum" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ALTER COLUMN "positioned_runs" DROP DEFAULT;