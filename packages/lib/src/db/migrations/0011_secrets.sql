CREATE TABLE "secrets" (
	"name" text PRIMARY KEY NOT NULL,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "secrets" ENABLE ROW LEVEL SECURITY;