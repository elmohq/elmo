DROP TABLE "prompt_tag_assignments" CASCADE;--> statement-breakpoint
DROP TABLE "prompt_tags" CASCADE;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
DROP TYPE "public"."tag_type";