CREATE TYPE "public"."evaluation_config_scope" AS ENUM('organization', 'brand', 'prompt');--> statement-breakpoint
CREATE TYPE "public"."evaluation_entitlement_scope" AS ENUM('instance', 'organization');--> statement-breakpoint
CREATE TYPE "public"."provider_credential_source" AS ENUM('legacy_env', 'encrypted_db', 'external_reference');--> statement-breakpoint
CREATE TABLE "evaluation_config_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"scope" "evaluation_config_scope",
	"organization_id" text,
	"brand_id" text,
	"prompt_id" uuid,
	"diff" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evaluation_config_audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "evaluation_entitlement_scope" NOT NULL,
	"organization_id" text,
	"max_configured_targets" integer,
	"max_configured_targets_per_brand" integer,
	"max_configured_targets_per_prompt" integer,
	"max_samples_per_dispatch" integer,
	"max_runs_per_day" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_entitlements_scope_owner_check" CHECK ((
				("evaluation_entitlements"."scope" = 'instance' AND "evaluation_entitlements"."organization_id" IS NULL)
				OR ("evaluation_entitlements"."scope" = 'organization' AND "evaluation_entitlements"."organization_id" IS NOT NULL)
			)),
	CONSTRAINT "evaluation_entitlements_limits_check" CHECK (("evaluation_entitlements"."max_configured_targets" IS NULL OR "evaluation_entitlements"."max_configured_targets" >= 0)
				AND ("evaluation_entitlements"."max_configured_targets_per_brand" IS NULL OR "evaluation_entitlements"."max_configured_targets_per_brand" >= 0)
				AND ("evaluation_entitlements"."max_configured_targets_per_prompt" IS NULL OR "evaluation_entitlements"."max_configured_targets_per_prompt" >= 0)
				AND ("evaluation_entitlements"."max_samples_per_dispatch" IS NULL OR "evaluation_entitlements"."max_samples_per_dispatch" >= 0)
				AND ("evaluation_entitlements"."max_runs_per_day" IS NULL OR "evaluation_entitlements"."max_runs_per_day" >= 0))
);
--> statement-breakpoint
ALTER TABLE "evaluation_entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_target_scope_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid,
	"scope" "evaluation_config_scope" NOT NULL,
	"organization_id" text,
	"brand_id" text,
	"prompt_id" uuid,
	"enabled" boolean,
	"cadence_hours" integer,
	"samples_per_dispatch" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_target_scope_configs_scope_owner_check" CHECK ((
				("evaluation_target_scope_configs"."scope" = 'organization' AND "evaluation_target_scope_configs"."organization_id" IS NOT NULL AND "evaluation_target_scope_configs"."brand_id" IS NULL AND "evaluation_target_scope_configs"."prompt_id" IS NULL)
				OR ("evaluation_target_scope_configs"."scope" = 'brand' AND "evaluation_target_scope_configs"."organization_id" IS NULL AND "evaluation_target_scope_configs"."brand_id" IS NOT NULL AND "evaluation_target_scope_configs"."prompt_id" IS NULL)
				OR ("evaluation_target_scope_configs"."scope" = 'prompt' AND "evaluation_target_scope_configs"."organization_id" IS NULL AND "evaluation_target_scope_configs"."brand_id" IS NULL AND "evaluation_target_scope_configs"."prompt_id" IS NOT NULL)
			)),
	CONSTRAINT "evaluation_target_scope_configs_cadence_check" CHECK ("evaluation_target_scope_configs"."cadence_hours" IS NULL OR "evaluation_target_scope_configs"."cadence_hours" > 0),
	CONSTRAINT "evaluation_target_scope_configs_samples_check" CHECK ("evaluation_target_scope_configs"."samples_per_dispatch" IS NULL OR "evaluation_target_scope_configs"."samples_per_dispatch" > 0)
);
--> statement-breakpoint
ALTER TABLE "evaluation_target_scope_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"model" text NOT NULL,
	"provider_connection_id" uuid NOT NULL,
	"version" text,
	"web_search" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"requires_prompt_assignment" boolean DEFAULT false NOT NULL,
	"default_cadence_hours" integer NOT NULL,
	"default_samples_per_dispatch" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_targets_defaults_check" CHECK ("evaluation_targets"."default_cadence_hours" > 0 AND "evaluation_targets"."default_samples_per_dispatch" > 0)
);
--> statement-breakpoint
ALTER TABLE "evaluation_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"configuration_version" integer DEFAULT 0 NOT NULL,
	"legacy_bootstrap_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"provider" text NOT NULL,
	"credential_source" "provider_credential_source" NOT NULL,
	"credential_reference" json,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "evaluation_target_id" uuid;--> statement-breakpoint
ALTER TABLE "evaluation_config_audit_logs" ADD CONSTRAINT "evaluation_config_audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_config_audit_logs" ADD CONSTRAINT "evaluation_config_audit_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_config_audit_logs" ADD CONSTRAINT "evaluation_config_audit_logs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_config_audit_logs" ADD CONSTRAINT "evaluation_config_audit_logs_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_entitlements" ADD CONSTRAINT "evaluation_entitlements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_target_scope_configs" ADD CONSTRAINT "evaluation_target_scope_configs_target_id_evaluation_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."evaluation_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_target_scope_configs" ADD CONSTRAINT "evaluation_target_scope_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_target_scope_configs" ADD CONSTRAINT "evaluation_target_scope_configs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_target_scope_configs" ADD CONSTRAINT "evaluation_target_scope_configs_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_targets" ADD CONSTRAINT "evaluation_targets_provider_connection_id_provider_connections_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluation_config_audit_logs_created_at_idx" ON "evaluation_config_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "evaluation_config_audit_logs_organization_id_idx" ON "evaluation_config_audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "evaluation_config_audit_logs_brand_id_idx" ON "evaluation_config_audit_logs" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_entitlements_instance_uidx" ON "evaluation_entitlements" USING btree ("scope") WHERE "evaluation_entitlements"."scope" = 'instance';--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_entitlements_organization_uidx" ON "evaluation_entitlements" USING btree ("organization_id") WHERE "evaluation_entitlements"."scope" = 'organization';--> statement-breakpoint
CREATE INDEX "evaluation_entitlements_organization_id_idx" ON "evaluation_entitlements" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_target_scope_configs_org_target_uidx" ON "evaluation_target_scope_configs" USING btree ("organization_id","target_id") WHERE "evaluation_target_scope_configs"."scope" = 'organization' AND "evaluation_target_scope_configs"."target_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_target_scope_configs_org_default_uidx" ON "evaluation_target_scope_configs" USING btree ("organization_id") WHERE "evaluation_target_scope_configs"."scope" = 'organization' AND "evaluation_target_scope_configs"."target_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_target_scope_configs_brand_target_uidx" ON "evaluation_target_scope_configs" USING btree ("brand_id","target_id") WHERE "evaluation_target_scope_configs"."scope" = 'brand' AND "evaluation_target_scope_configs"."target_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_target_scope_configs_brand_default_uidx" ON "evaluation_target_scope_configs" USING btree ("brand_id") WHERE "evaluation_target_scope_configs"."scope" = 'brand' AND "evaluation_target_scope_configs"."target_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_target_scope_configs_prompt_target_uidx" ON "evaluation_target_scope_configs" USING btree ("prompt_id","target_id") WHERE "evaluation_target_scope_configs"."scope" = 'prompt' AND "evaluation_target_scope_configs"."target_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_target_scope_configs_prompt_default_uidx" ON "evaluation_target_scope_configs" USING btree ("prompt_id") WHERE "evaluation_target_scope_configs"."scope" = 'prompt' AND "evaluation_target_scope_configs"."target_id" IS NULL;--> statement-breakpoint
CREATE INDEX "evaluation_target_scope_configs_organization_id_idx" ON "evaluation_target_scope_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "evaluation_target_scope_configs_brand_id_idx" ON "evaluation_target_scope_configs" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "evaluation_target_scope_configs_prompt_id_idx" ON "evaluation_target_scope_configs" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_targets_key_uidx" ON "evaluation_targets" USING btree ("key");--> statement-breakpoint
CREATE INDEX "evaluation_targets_provider_connection_id_idx" ON "evaluation_targets" USING btree ("provider_connection_id");--> statement-breakpoint
CREATE INDEX "evaluation_targets_model_idx" ON "evaluation_targets" USING btree ("model");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_key_uidx" ON "provider_connections" USING btree ("key");--> statement-breakpoint
CREATE INDEX "provider_connections_provider_idx" ON "provider_connections" USING btree ("provider");--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD CONSTRAINT "prompt_runs_evaluation_target_id_evaluation_targets_id_fk" FOREIGN KEY ("evaluation_target_id") REFERENCES "public"."evaluation_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_runs_evaluation_target_id_idx" ON "prompt_runs" USING btree ("evaluation_target_id");