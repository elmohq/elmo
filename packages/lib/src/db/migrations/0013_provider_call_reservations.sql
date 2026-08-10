CREATE TABLE "provider_call_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"external_task_id" text,
	"quarantine_until" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "provider_call_reservations_active_idx" ON "provider_call_reservations" USING btree ("provider","released_at","quarantine_until");--> statement-breakpoint
CREATE INDEX "provider_call_reservations_owner_idx" ON "provider_call_reservations" USING btree ("owner_type","owner_id");