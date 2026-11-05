CREATE TABLE "organization_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"entitlement_overrides" jsonb,
	"premium_addon_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'incomplete',
	"period_start" timestamp,
	"period_end" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"cancel_at" timestamp,
	"canceled_at" timestamp,
	"ended_at" timestamp,
	"seats" integer,
	"billing_interval" text,
	"stripe_schedule_id" text
);
--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "premium_models" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Entitlement resolution and the billing UI look subscriptions up by their
-- org (reference_id). The generated schema (schema-auth.ts) can't carry this
-- index — the better-auth generator doesn't emit indexes — so it lives only
-- here; drizzle snapshots never see it and will neither recreate nor drop it.
CREATE INDEX "subscription_reference_id_idx" ON "subscription" ("reference_id");
