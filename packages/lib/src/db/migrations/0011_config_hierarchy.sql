-- DB-backed configuration hierarchy (instance → org → brand → prompt).
--
-- Adds the single cascading `configs` table plus the non-cascading entity
-- tables it references (`model_targets`, `provider_credentials`,
-- `organization_settings`, `instance_meta`), then absorbs the two brand
-- run-config columns into brand-scope `configs` rows and drops them.
--
-- Requires Postgres >= 15 for `UNIQUE NULLS NOT DISTINCT` on the identity
-- tuples (CLI compose pins postgres:16-alpine).

-- Fail fast rather than queue behind a long-running query / worker insert.
SET lock_timeout = '5s';
SET statement_timeout = '15min';

CREATE TABLE "configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"organization_id" text,
	"brand_id" text,
	"prompt_id" uuid,
	"model" text,
	"target_id" uuid,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configs_identity_uidx" UNIQUE NULLS NOT DISTINCT("scope","organization_id","brand_id","prompt_id","model","target_id","key"),
	CONSTRAINT "configs_scope_fk_check" CHECK ((CASE "configs"."scope"
				WHEN 'instance' THEN "configs"."organization_id" IS NULL AND "configs"."brand_id" IS NULL AND "configs"."prompt_id" IS NULL
				WHEN 'organization' THEN "configs"."organization_id" IS NOT NULL AND "configs"."brand_id" IS NULL AND "configs"."prompt_id" IS NULL
				WHEN 'brand' THEN "configs"."organization_id" IS NULL AND "configs"."brand_id" IS NOT NULL AND "configs"."prompt_id" IS NULL
				WHEN 'prompt' THEN "configs"."organization_id" IS NULL AND "configs"."brand_id" IS NULL AND "configs"."prompt_id" IS NOT NULL
				ELSE false END)),
	CONSTRAINT "configs_selector_check" CHECK (NOT ("configs"."model" IS NOT NULL AND "configs"."target_id" IS NOT NULL)),
	CONSTRAINT "configs_value_not_json_null_check" CHECK (jsonb_typeof("configs"."value") <> 'null')
);
--> statement-breakpoint
ALTER TABLE "configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "instance_meta" (
	"id" text PRIMARY KEY NOT NULL,
	"env_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_meta_id_check" CHECK ("instance_meta"."id" = 'instance')
);
--> statement-breakpoint
ALTER TABLE "instance_meta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "model_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"version" text,
	"web_search" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"required_entitlement" text,
	"request_policy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_targets_identity_uidx" UNIQUE NULLS NOT DISTINCT("organization_id","model","provider","version","web_search")
);
--> statement-breakpoint
ALTER TABLE "model_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"plan_key" text,
	"entitlement_overrides" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"provider" text NOT NULL,
	"source" text NOT NULL,
	"encrypted_data" jsonb,
	"secret_ref" jsonb,
	"hint" text,
	"last_verified_at" timestamp with time zone,
	"last_verify_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_provider_org_uidx" UNIQUE NULLS NOT DISTINCT("provider","organization_id")
);
--> statement-breakpoint
ALTER TABLE "provider_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "configs" ADD CONSTRAINT "configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configs" ADD CONSTRAINT "configs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configs" ADD CONSTRAINT "configs_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configs" ADD CONSTRAINT "configs_target_id_model_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."model_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_targets" ADD CONSTRAINT "model_targets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "configs_organization_id_idx" ON "configs" USING btree ("organization_id") WHERE "configs"."organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "configs_brand_id_idx" ON "configs" USING btree ("brand_id") WHERE "configs"."brand_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "configs_prompt_id_idx" ON "configs" USING btree ("prompt_id") WHERE "configs"."prompt_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "configs_scope_model_key_idx" ON "configs" USING btree ("scope","model","key") WHERE "configs"."model" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "configs_target_id_idx" ON "configs" USING btree ("target_id") WHERE "configs"."target_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "model_targets_organization_id_idx" ON "model_targets" USING btree ("organization_id");--> statement-breakpoint
-- Absorb the two brand run-config columns into brand-scope `configs` rows
-- before dropping them. delay_override_hours -> run.cadence_hours;
-- enabled_models -> run.enabled_models (exact legacy semantics, including
-- [] = "none", a real stored value). A NULL column means "default"/"all" and
-- stays an absent row — the registry default supplies it at resolve time.
INSERT INTO "configs" ("scope", "brand_id", "key", "value")
SELECT 'brand', "id", 'run.cadence_hours', to_jsonb("delay_override_hours")
FROM "brands"
WHERE "delay_override_hours" IS NOT NULL;--> statement-breakpoint
INSERT INTO "configs" ("scope", "brand_id", "key", "value")
SELECT 'brand', "id", 'run.enabled_models', to_jsonb("enabled_models")
FROM "brands"
WHERE "enabled_models" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "delay_override_hours";--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "enabled_models";
