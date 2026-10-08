ALTER TABLE "prompt_runs" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "country" text DEFAULT 'US' NOT NULL;