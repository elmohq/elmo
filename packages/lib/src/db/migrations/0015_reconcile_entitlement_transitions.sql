ALTER TYPE "public"."scheduler_rollout_mode" ADD VALUE 'paused';--> statement-breakpoint
CREATE TABLE "organization_entitlement_reconciliations" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"applied_source_token" text,
	"reconcile_after" timestamp with time zone,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_entitlement_reconciliations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_entitlement_reconciliations" ADD CONSTRAINT "organization_entitlement_reconciliations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_entitlement_reconciliations_due_idx" ON "organization_entitlement_reconciliations" USING btree ("reconcile_after");--> statement-breakpoint
INSERT INTO "organization_entitlement_reconciliations" ("organization_id", "reconcile_after")
SELECT DISTINCT "brands"."organization_id", now()
FROM "brands"
INNER JOIN "brand_scheduler_rollouts" ON "brand_scheduler_rollouts"."brand_id" = "brands"."id"
WHERE "brand_scheduler_rollouts"."mode" = 'v2'
ON CONFLICT ("organization_id") DO NOTHING;
