CREATE TYPE "public"."billing_mutation_kind" AS ENUM('checkout', 'plan', 'addon');--> statement-breakpoint
CREATE TYPE "public"."billing_mutation_status" AS ENUM('pending', 'applied', 'failed');--> statement-breakpoint
CREATE TABLE "organization_billing_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"mutation_id" text NOT NULL,
	"kind" "billing_mutation_kind" NOT NULL,
	"status" "billing_mutation_status" DEFAULT 'pending' NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"stripe_idempotency_key" text NOT NULL,
	"target_plan_key" text NOT NULL,
	"target_billing_interval" text NOT NULL,
	"target_claude_addon_prompt_slots" integer NOT NULL,
	"stripe_update_params" jsonb NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_checkout_session_url" text,
	"stripe_checkout_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_billing_mutations_interval_check" CHECK ("organization_billing_mutations"."target_billing_interval" IN ('month', 'year')),
	CONSTRAINT "organization_billing_mutations_addon_slots_check" CHECK ("organization_billing_mutations"."target_claude_addon_prompt_slots" >= 0),
	CONSTRAINT "organization_billing_mutations_attempt_count_check" CHECK ("organization_billing_mutations"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "organization_billing_mutations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_billing_subscriptions" ADD COLUMN "delinquent_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization_billing_mutations" ADD CONSTRAINT "organization_billing_mutations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_billing_mutations_org_mutation_uidx" ON "organization_billing_mutations" USING btree ("organization_id","mutation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_billing_mutations_stripe_idempotency_uidx" ON "organization_billing_mutations" USING btree ("stripe_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_billing_mutations_one_pending_uidx" ON "organization_billing_mutations" USING btree ("organization_id") WHERE "organization_billing_mutations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "organization_billing_mutations_recovery_idx" ON "organization_billing_mutations" USING btree ("status","next_attempt_at","created_at");