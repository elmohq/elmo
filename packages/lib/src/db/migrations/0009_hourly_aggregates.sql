CREATE TABLE "aggregate_refresh_state" (
	"id" smallint PRIMARY KEY NOT NULL,
	"last_refreshed_through" timestamp with time zone DEFAULT 'epoch'::timestamptz NOT NULL,
	"last_run_started_at" timestamp with time zone,
	"last_run_finished_at" timestamp with time zone,
	"last_run_status" text,
	"last_run_error" text,
	"last_affected_buckets" integer,
	"backfill_started_at" timestamp with time zone,
	"backfill_completed_at" timestamp with time zone,
	"backfill_cursor_brand_id" text,
	"backfill_cursor_date" date
);
--> statement-breakpoint
CREATE TABLE "hourly_citation_urls" (
	"brand_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"count" integer NOT NULL,
	"sum_citation_index" integer NOT NULL,
	CONSTRAINT "hourly_citation_urls_pkey" PRIMARY KEY("brand_id","hour","prompt_id","model","url")
);
--> statement-breakpoint
CREATE TABLE "hourly_citations" (
	"brand_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"domain" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "hourly_citations_pkey" PRIMARY KEY("brand_id","hour","prompt_id","model","domain")
);
--> statement-breakpoint
CREATE TABLE "hourly_prompt_run_competitors" (
	"brand_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"competitor_name" text NOT NULL,
	"mention_count" integer NOT NULL,
	CONSTRAINT "hourly_prompt_run_competitors_pkey" PRIMARY KEY("brand_id","hour","prompt_id","model","competitor_name")
);
--> statement-breakpoint
CREATE TABLE "hourly_prompt_runs" (
	"brand_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"web_search_enabled" boolean NOT NULL,
	"total_runs" integer NOT NULL,
	"brand_mentioned_count" integer NOT NULL,
	"competitor_run_count" integer NOT NULL,
	"competitor_mention_sum" integer NOT NULL,
	"first_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hourly_prompt_runs_pkey" PRIMARY KEY("brand_id","hour","prompt_id","model","web_search_enabled")
);
--> statement-breakpoint
CREATE INDEX "hourly_citation_urls_brand_hour_url_idx" ON "hourly_citation_urls" USING btree ("brand_id","hour","url");--> statement-breakpoint
CREATE INDEX "hourly_citation_urls_prompt_hour_idx" ON "hourly_citation_urls" USING btree ("prompt_id","hour");--> statement-breakpoint
CREATE INDEX "hourly_citations_brand_hour_domain_idx" ON "hourly_citations" USING btree ("brand_id","hour","domain");--> statement-breakpoint
CREATE INDEX "hourly_citations_prompt_hour_idx" ON "hourly_citations" USING btree ("prompt_id","hour");--> statement-breakpoint
CREATE INDEX "hourly_prompt_run_competitors_brand_hour_idx" ON "hourly_prompt_run_competitors" USING btree ("brand_id","hour");--> statement-breakpoint
CREATE INDEX "hourly_prompt_run_competitors_prompt_hour_idx" ON "hourly_prompt_run_competitors" USING btree ("prompt_id","hour");--> statement-breakpoint
CREATE INDEX "hourly_prompt_runs_brand_hour_prompt_idx" ON "hourly_prompt_runs" USING btree ("brand_id","hour","prompt_id");--> statement-breakpoint
CREATE INDEX "hourly_prompt_runs_prompt_hour_idx" ON "hourly_prompt_runs" USING btree ("prompt_id","hour");--> statement-breakpoint
-- Seed the singleton state row so the worker and backfill have something to read on first tick.
INSERT INTO "aggregate_refresh_state" ("id") VALUES (1) ON CONFLICT DO NOTHING;
