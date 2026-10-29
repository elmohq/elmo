CREATE TABLE "brand_data_versions" (
	"brand_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	"version" bigint NOT NULL,
	CONSTRAINT "brand_data_versions_pk" PRIMARY KEY("brand_id","chunk_id")
);
--> statement-breakpoint
ALTER TABLE "brand_data_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_data_versions" ADD CONSTRAINT "brand_data_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE SEQUENCE "brand_data_version_seq";--> statement-breakpoint
CREATE FUNCTION "bump_brand_data_months"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
	SELECT changed."brand_id", changed."chunk_id", nextval('brand_data_version_seq')
	FROM (
		SELECT DISTINCT "brand_id", TG_ARGV[0] || ':' || to_char("bucket" AT TIME ZONE 'UTC', 'YYYY-MM') AS "chunk_id"
		FROM "changed_rows"
	) changed
	JOIN "brands" b ON b."id" = changed."brand_id"
	ON CONFLICT ("brand_id", "chunk_id") DO UPDATE SET "version" = EXCLUDED."version";
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "bump_brand_data_pages"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
	SELECT changed."brand_id", changed."chunk_id", nextval('brand_data_version_seq')
	FROM (SELECT DISTINCT "brand_id", 'pages:' || ("page_id" / 200000) AS "chunk_id" FROM "changed_rows") changed
	JOIN "brands" b ON b."id" = changed."brand_id"
	ON CONFLICT ("brand_id", "chunk_id") DO UPDATE SET "version" = EXCLUDED."version";
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "bump_brand_data_entities"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
	SELECT changed."brand_id", 'entities', nextval('brand_data_version_seq')
	FROM (SELECT DISTINCT "brand_id" AS "brand_id" FROM "changed_rows") changed
	JOIN "brands" b ON b."id" = changed."brand_id"
	ON CONFLICT ("brand_id", "chunk_id") DO UPDATE SET "version" = EXCLUDED."version";
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "bump_brand_data_brand"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
	SELECT changed."brand_id", 'entities', nextval('brand_data_version_seq')
	FROM (SELECT DISTINCT "id" AS "brand_id" FROM "changed_rows") changed
	JOIN "brands" b ON b."id" = changed."brand_id"
	ON CONFLICT ("brand_id", "chunk_id") DO UPDATE SET "version" = EXCLUDED."version";
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "rollup_prompt_runs_brand_data_insert" AFTER INSERT ON "rollup_prompt_runs"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('promptRuns');--> statement-breakpoint
CREATE TRIGGER "rollup_prompt_runs_brand_data_update" AFTER UPDATE ON "rollup_prompt_runs"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('promptRuns');--> statement-breakpoint
CREATE TRIGGER "rollup_prompt_runs_brand_data_delete" AFTER DELETE ON "rollup_prompt_runs"
	REFERENCING OLD TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('promptRuns');--> statement-breakpoint
CREATE TRIGGER "rollup_competitor_mentions_brand_data_insert" AFTER INSERT ON "rollup_competitor_mentions"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('competitorMentions');--> statement-breakpoint
CREATE TRIGGER "rollup_competitor_mentions_brand_data_update" AFTER UPDATE ON "rollup_competitor_mentions"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('competitorMentions');--> statement-breakpoint
CREATE TRIGGER "rollup_competitor_mentions_brand_data_delete" AFTER DELETE ON "rollup_competitor_mentions"
	REFERENCING OLD TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('competitorMentions');--> statement-breakpoint
CREATE TRIGGER "rollup_web_queries_brand_data_insert" AFTER INSERT ON "rollup_web_queries"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('webQueries');--> statement-breakpoint
CREATE TRIGGER "rollup_web_queries_brand_data_update" AFTER UPDATE ON "rollup_web_queries"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('webQueries');--> statement-breakpoint
CREATE TRIGGER "rollup_web_queries_brand_data_delete" AFTER DELETE ON "rollup_web_queries"
	REFERENCING OLD TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('webQueries');--> statement-breakpoint
CREATE TRIGGER "rollup_sentiment_quotes_brand_data_insert" AFTER INSERT ON "rollup_sentiment_quotes"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('sentimentQuotes');--> statement-breakpoint
CREATE TRIGGER "rollup_sentiment_quotes_brand_data_update" AFTER UPDATE ON "rollup_sentiment_quotes"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('sentimentQuotes');--> statement-breakpoint
CREATE TRIGGER "rollup_sentiment_quotes_brand_data_delete" AFTER DELETE ON "rollup_sentiment_quotes"
	REFERENCING OLD TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('sentimentQuotes');--> statement-breakpoint
CREATE TRIGGER "rollup_citation_urls_brand_data_insert" AFTER INSERT ON "rollup_citation_urls"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('citations');--> statement-breakpoint
CREATE TRIGGER "rollup_citation_urls_brand_data_update" AFTER UPDATE ON "rollup_citation_urls"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('citations');--> statement-breakpoint
CREATE TRIGGER "rollup_citation_urls_brand_data_delete" AFTER DELETE ON "rollup_citation_urls"
	REFERENCING OLD TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_months"('citations');--> statement-breakpoint
CREATE TRIGGER "rollup_citation_pages_brand_data_insert" AFTER INSERT ON "rollup_citation_pages"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_pages"();--> statement-breakpoint
CREATE TRIGGER "rollup_citation_pages_brand_data_update" AFTER UPDATE ON "rollup_citation_pages"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_pages"();--> statement-breakpoint
CREATE TRIGGER "rollup_citation_pages_brand_data_delete" AFTER DELETE ON "rollup_citation_pages"
	REFERENCING OLD TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_pages"();--> statement-breakpoint
CREATE TRIGGER "prompts_brand_data_insert" AFTER INSERT ON "prompts"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_entities"();--> statement-breakpoint
CREATE TRIGGER "prompts_brand_data_update" AFTER UPDATE ON "prompts"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_entities"();--> statement-breakpoint
CREATE TRIGGER "prompts_brand_data_delete" AFTER DELETE ON "prompts"
	REFERENCING OLD TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_entities"();--> statement-breakpoint
CREATE TRIGGER "competitors_brand_data_insert" AFTER INSERT ON "competitors"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_entities"();--> statement-breakpoint
CREATE TRIGGER "competitors_brand_data_update" AFTER UPDATE ON "competitors"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_entities"();--> statement-breakpoint
CREATE TRIGGER "competitors_brand_data_delete" AFTER DELETE ON "competitors"
	REFERENCING OLD TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_entities"();--> statement-breakpoint
CREATE TRIGGER "brands_brand_data_insert" AFTER INSERT ON "brands"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_brand"();--> statement-breakpoint
CREATE TRIGGER "brands_brand_data_update" AFTER UPDATE ON "brands"
	REFERENCING NEW TABLE AS "changed_rows" FOR EACH STATEMENT EXECUTE FUNCTION "bump_brand_data_brand"();--> statement-breakpoint
INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
SELECT "brand_id", 'promptRuns:' || "month", nextval('brand_data_version_seq')
FROM (SELECT DISTINCT "brand_id", to_char("bucket" AT TIME ZONE 'UTC', 'YYYY-MM') AS "month" FROM "rollup_prompt_runs") existing
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
SELECT "brand_id", 'competitorMentions:' || "month", nextval('brand_data_version_seq')
FROM (SELECT DISTINCT "brand_id", to_char("bucket" AT TIME ZONE 'UTC', 'YYYY-MM') AS "month" FROM "rollup_competitor_mentions") existing
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
SELECT "brand_id", 'webQueries:' || "month", nextval('brand_data_version_seq')
FROM (SELECT DISTINCT "brand_id", to_char("bucket" AT TIME ZONE 'UTC', 'YYYY-MM') AS "month" FROM "rollup_web_queries") existing
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
SELECT "brand_id", 'sentimentQuotes:' || "month", nextval('brand_data_version_seq')
FROM (SELECT DISTINCT "brand_id", to_char("bucket" AT TIME ZONE 'UTC', 'YYYY-MM') AS "month" FROM "rollup_sentiment_quotes") existing
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
SELECT "brand_id", 'citations:' || "month", nextval('brand_data_version_seq')
FROM (SELECT DISTINCT "brand_id", to_char("bucket" AT TIME ZONE 'UTC', 'YYYY-MM') AS "month" FROM "rollup_citation_urls") existing
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
SELECT "brand_id", 'pages:' || "range", nextval('brand_data_version_seq')
FROM (SELECT DISTINCT "brand_id", "page_id" / 200000 AS "range" FROM "rollup_citation_pages") existing
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "brand_data_versions" ("brand_id", "chunk_id", "version")
SELECT "id", 'entities', nextval('brand_data_version_seq') FROM "brands"
ON CONFLICT DO NOTHING;
