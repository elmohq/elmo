CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"prompt_id" uuid,
	"event_type" text NOT NULL,
	"provider" text,
	"model" text,
	"web_search_enabled" boolean DEFAULT false NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"estimated_cost_usd" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "usage_events_org_created_idx" ON "usage_events" USING btree ("organization_id","created_at");