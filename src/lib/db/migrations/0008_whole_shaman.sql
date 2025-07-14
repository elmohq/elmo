ALTER TABLE "prompts" RENAME COLUMN "group" TO "group_category";--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "group_prefix" text;