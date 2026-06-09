CREATE TABLE "domain_ratings" (
	"domain" text PRIMARY KEY NOT NULL,
	"rating" real,
	"status" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_ratings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "domain_ratings_fetched_at_idx" ON "domain_ratings" USING btree ("fetched_at");