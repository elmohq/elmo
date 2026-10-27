CREATE TABLE "rollup_citation_pages" (
	"brand_id" text NOT NULL,
	"page_id" bigint NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"page_type" text NOT NULL,
	"static_category" text NOT NULL,
	CONSTRAINT "rollup_citation_pages_pk" PRIMARY KEY("brand_id","page_id")
);
--> statement-breakpoint
ALTER TABLE "rollup_citation_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "rollup_citation_pages" ("brand_id", "page_id", "url", "domain", "title", "page_type", "static_category")
SELECT r."brand_id", cp."id", cp."url", cp."domain", cp."title", cp."page_type", cp."static_category"
FROM (SELECT DISTINCT "brand_id", "page_id" FROM "rollup_citation_urls") r
JOIN "cited_pages" cp ON cp."id" = r."page_id"
ORDER BY r."brand_id", r."page_id";--> statement-breakpoint
CREATE TABLE "rollup_sentiment_quotes" (
	"brand_id" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"prompt_id" uuid NOT NULL,
	"model" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"web_search_enabled" boolean NOT NULL,
	"sentiment" text NOT NULL,
	"run_id" uuid NOT NULL,
	"confidence" double precision NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rollup_sentiment_quotes_pk" PRIMARY KEY("brand_id","bucket","prompt_id","model","provider","web_search_enabled","sentiment")
);
--> statement-breakpoint
ALTER TABLE "rollup_sentiment_quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rollup_citation_pages" ADD CONSTRAINT "rollup_citation_pages_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_citation_pages" ADD CONSTRAINT "rollup_citation_pages_page_id_cited_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."cited_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_sentiment_quotes" ADD CONSTRAINT "rollup_sentiment_quotes_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rollup_citation_pages_page_id_idx" ON "rollup_citation_pages" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "rollup_sentiment_quotes_prompt_id_bucket_idx" ON "rollup_sentiment_quotes" USING btree ("prompt_id","bucket");