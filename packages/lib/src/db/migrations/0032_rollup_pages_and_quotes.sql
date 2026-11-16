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
INSERT INTO "rollup_citation_pages" ("brand_id", "page_id", "url", "domain", "title", "page_type", "static_category")
SELECT r."brand_id", cp."id", cp."url", cp."domain", cp."title", cp."page_type", cp."static_category"
FROM (SELECT DISTINCT "brand_id", "page_id" FROM "rollup_citation_urls") r
JOIN "cited_pages" cp ON cp."id" = r."page_id"
ORDER BY r."brand_id", r."page_id";--> statement-breakpoint
INSERT INTO "rollup_sentiment_quotes" (
	"brand_id", "bucket", "prompt_id", "model", "provider", "web_search_enabled", "sentiment", "run_id", "confidence", "created_at"
)
SELECT DISTINCT ON (pr."brand_id", 2, pr."prompt_id", pr."model", 5, pr."web_search_enabled", 7)
	pr."brand_id",
	date_bin(interval '15 minutes', pr."created_at", timestamptz '2000-01-01T00:00:00Z'),
	pr."prompt_id",
	pr."model",
	coalesce(pr."provider", ''),
	pr."web_search_enabled",
	m."assessments"->'brand'->>'sentiment',
	pr."id",
	coalesce((m."assessments"->'brand'->'sentimentProbabilities'->>(m."assessments"->'brand'->>'sentiment'))::float8, 0),
	pr."created_at"
FROM "prompt_runs" pr
JOIN "prompts" p ON p."id" = pr."prompt_id" AND p."brand_id" = pr."brand_id"
JOIN "run_mentions" m ON m."run_id" = pr."id"
JOIN "run_extractions" re ON re."run_id" = pr."id"
WHERE m."brand_mentioned"
	AND m."assessments"->'brand'->>'sentiment' IS NOT NULL
	AND (m."assessments"->'brand'->'passage'->>'start')::int < (m."assessments"->'brand'->'passage'->>'end')::int
	AND re."text_content" IS NOT NULL
ORDER BY pr."brand_id", 2, pr."prompt_id", pr."model", 5, pr."web_search_enabled", 7, 9 DESC, pr."created_at" DESC, pr."id";--> statement-breakpoint
ALTER TABLE "rollup_citation_pages" ADD CONSTRAINT "rollup_citation_pages_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_sentiment_quotes" ADD CONSTRAINT "rollup_sentiment_quotes_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rollup_citation_pages_page_id_idx" ON "rollup_citation_pages" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "rollup_sentiment_quotes_prompt_id_bucket_idx" ON "rollup_sentiment_quotes" USING btree ("prompt_id","bucket");