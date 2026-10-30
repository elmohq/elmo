CREATE TABLE "background_migrations" (
	"name" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"progress" jsonb,
	"rows_done" bigint DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "background_migrations" ENABLE ROW LEVEL SECURITY;