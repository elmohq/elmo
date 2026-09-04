CREATE TABLE "cited_pages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cited_pages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"page_type" text NOT NULL,
	"static_category" text NOT NULL,
	"classifier_version" integer NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cited_pages_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "cited_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pipeline_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"backfill_enqueued_at" timestamp with time zone,
	"backfill_completed_at" timestamp with time zone,
	"rollup_version" integer DEFAULT 0 NOT NULL,
	"classifier_version" integer DEFAULT 0 NOT NULL,
	"extractor_version" integer DEFAULT 0 NOT NULL,
	"deriver_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_reconcile_at" timestamp with time zone,
	CONSTRAINT "pipeline_state_singleton" CHECK (id = 1)
);
--> statement-breakpoint
ALTER TABLE "pipeline_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rollup_citation_domains" (
	"brand_id" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"prompt_id" uuid NOT NULL,
	"model" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"web_search_enabled" boolean NOT NULL,
	"domain" text NOT NULL,
	"static_category" text NOT NULL,
	"citations" integer NOT NULL,
	CONSTRAINT "rollup_citation_domains_pk" PRIMARY KEY("brand_id","bucket","prompt_id","model","provider","web_search_enabled","domain")
);
--> statement-breakpoint
ALTER TABLE "rollup_citation_domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rollup_citation_urls" (
	"brand_id" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"prompt_id" uuid NOT NULL,
	"model" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"web_search_enabled" boolean NOT NULL,
	"page_id" bigint NOT NULL,
	"domain" text NOT NULL,
	"static_category" text NOT NULL,
	"page_type" text NOT NULL,
	"citations" integer NOT NULL,
	"position_sum" integer NOT NULL,
	"position_count" integer NOT NULL,
	CONSTRAINT "rollup_citation_urls_pk" PRIMARY KEY("brand_id","bucket","prompt_id","model","provider","web_search_enabled","page_id")
);
--> statement-breakpoint
ALTER TABLE "rollup_citation_urls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rollup_competitor_mentions" (
	"brand_id" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"prompt_id" uuid NOT NULL,
	"model" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"web_search_enabled" boolean NOT NULL,
	"competitor_name" text NOT NULL,
	"runs" integer NOT NULL,
	CONSTRAINT "rollup_competitor_mentions_pk" PRIMARY KEY("brand_id","bucket","prompt_id","model","provider","web_search_enabled","competitor_name")
);
--> statement-breakpoint
ALTER TABLE "rollup_competitor_mentions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rollup_dirty" (
	"brand_id" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rollup_dirty_pk" PRIMARY KEY("brand_id","bucket")
);
--> statement-breakpoint
ALTER TABLE "rollup_dirty" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rollup_prompt_runs" (
	"brand_id" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"prompt_id" uuid NOT NULL,
	"model" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"web_search_enabled" boolean NOT NULL,
	"runs" integer NOT NULL,
	"brand_mentioned_runs" integer NOT NULL,
	"competitor_runs" integer NOT NULL,
	"competitor_mentions" integer NOT NULL,
	"first_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rollup_prompt_runs_pk" PRIMARY KEY("brand_id","bucket","prompt_id","model","provider","web_search_enabled")
);
--> statement-breakpoint
ALTER TABLE "rollup_prompt_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "extractor_version" integer;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "analysis_versions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_citation_urls" ADD CONSTRAINT "rollup_citation_urls_page_id_cited_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."cited_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cited_pages_domain_idx" ON "cited_pages" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "rollup_citation_domains_prompt_id_bucket_idx" ON "rollup_citation_domains" USING btree ("prompt_id","bucket");--> statement-breakpoint
CREATE INDEX "rollup_citation_urls_prompt_id_bucket_idx" ON "rollup_citation_urls" USING btree ("prompt_id","bucket");--> statement-breakpoint
CREATE INDEX "rollup_competitor_mentions_prompt_id_bucket_idx" ON "rollup_competitor_mentions" USING btree ("prompt_id","bucket");--> statement-breakpoint
CREATE INDEX "rollup_dirty_bucket_idx" ON "rollup_dirty" USING btree ("bucket");--> statement-breakpoint
CREATE INDEX "rollup_prompt_runs_prompt_id_bucket_idx" ON "rollup_prompt_runs" USING btree ("prompt_id","bucket");--> statement-breakpoint
INSERT INTO "pipeline_state" ("id") VALUES (1) ON CONFLICT DO NOTHING;
