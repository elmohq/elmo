ALTER TABLE "prompt_runs" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "analyzed_at" timestamp with time zone;