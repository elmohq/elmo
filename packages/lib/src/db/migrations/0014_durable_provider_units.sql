CREATE TABLE "worker_scheduler_control" (
	"id" text PRIMARY KEY NOT NULL,
	"legacy_prompt_admission_open" boolean DEFAULT true NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_scheduler_control" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "work_key" text;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "result_payload" json;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "release_reason" text;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "released_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_call_reservations_work_idx" ON "provider_call_reservations" USING btree ("owner_type","owner_id","work_key");