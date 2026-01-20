CREATE TYPE "public"."model_groups" AS ENUM('openai', 'anthropic', 'google');--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "modelGroup" "model_groups" NOT NULL;