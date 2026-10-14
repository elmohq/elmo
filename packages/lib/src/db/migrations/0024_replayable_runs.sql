CREATE TABLE "run_extractions" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"text_content" text,
	"stamp" text
);
--> statement-breakpoint
ALTER TABLE "run_extractions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "run_mentions" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"brand_mentioned" boolean NOT NULL,
	"competitors_mentioned" text[] DEFAULT '{}' NOT NULL,
	"stamp" text
);
--> statement-breakpoint
ALTER TABLE "run_mentions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Existing brands get NULL ("predates stamping"; the worker adopts today's stamps on startup), new ones '{}'.
ALTER TABLE "brands" ADD COLUMN "analysis_versions" jsonb;--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "analysis_versions" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
-- Existing runs move their derived columns over unstamped, so the next replay treats them as stale.
INSERT INTO "run_extractions" ("run_id") SELECT "id" FROM "prompt_runs";--> statement-breakpoint
INSERT INTO "run_mentions" ("run_id", "brand_mentioned", "competitors_mentioned")
	SELECT "id", "brand_mentioned", "competitors_mentioned" FROM "prompt_runs";--> statement-breakpoint
ALTER TABLE "run_extractions" ADD CONSTRAINT "run_extractions_run_id_prompt_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_mentions" ADD CONSTRAINT "run_mentions_run_id_prompt_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_runs" DROP COLUMN "brand_mentioned";--> statement-breakpoint
ALTER TABLE "prompt_runs" DROP COLUMN "competitors_mentioned";--> statement-breakpoint
CREATE FUNCTION "prompt_runs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'prompt_runs is append-only; derived data lives in run_extractions, run_mentions and citations';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "prompt_runs_append_only" BEFORE UPDATE ON "prompt_runs"
	FOR EACH ROW EXECUTE FUNCTION "prompt_runs_append_only"();
