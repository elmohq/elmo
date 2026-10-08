ALTER TABLE "prompt_runs" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "country" text DEFAULT 'US' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "group_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "prompts_brand_id_group_id_idx" ON "prompts" USING btree ("brand_id","group_id");