-- Bound the metadata-lock wait so this additive lease migration fails safely
-- instead of sitting behind live local or whitelabel traffic during upgrade.
SET lock_timeout = '5s';
SET statement_timeout = '15min';--> statement-breakpoint

ALTER TABLE "brand_analysis_admissions" DROP CONSTRAINT "brand_analysis_admissions_state_check";--> statement-breakpoint
ALTER TABLE "brand_analysis_admissions" ADD COLUMN "provider_lease_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "brand_analysis_admissions"
SET "provider_lease_expires_at" = GREATEST("provider_started_at", "updated_at", now()) + INTERVAL '30 minutes'
WHERE "status" = 'running';--> statement-breakpoint
ALTER TABLE "brand_analysis_admissions" ADD CONSTRAINT "brand_analysis_admissions_state_check" CHECK ((
					("brand_analysis_admissions"."status" = 'pending' AND "brand_analysis_admissions"."result" IS NULL AND "brand_analysis_admissions"."last_error" IS NULL AND "brand_analysis_admissions"."provider_started_at" IS NULL AND "brand_analysis_admissions"."provider_lease_expires_at" IS NULL AND "brand_analysis_admissions"."completed_at" IS NULL AND "brand_analysis_admissions"."failed_at" IS NULL)
					OR ("brand_analysis_admissions"."status" = 'running' AND "brand_analysis_admissions"."result" IS NULL AND "brand_analysis_admissions"."last_error" IS NULL AND "brand_analysis_admissions"."provider_started_at" IS NOT NULL AND "brand_analysis_admissions"."provider_lease_expires_at" IS NOT NULL AND "brand_analysis_admissions"."provider_lease_expires_at" > "brand_analysis_admissions"."provider_started_at" AND "brand_analysis_admissions"."completed_at" IS NULL AND "brand_analysis_admissions"."failed_at" IS NULL)
					OR ("brand_analysis_admissions"."status" = 'completed' AND "brand_analysis_admissions"."result" IS NOT NULL AND "brand_analysis_admissions"."last_error" IS NULL AND "brand_analysis_admissions"."provider_started_at" IS NOT NULL AND "brand_analysis_admissions"."provider_lease_expires_at" IS NULL AND "brand_analysis_admissions"."completed_at" IS NOT NULL AND "brand_analysis_admissions"."failed_at" IS NULL)
					OR ("brand_analysis_admissions"."status" = 'failed' AND "brand_analysis_admissions"."result" IS NULL AND "brand_analysis_admissions"."last_error" IS NOT NULL AND "brand_analysis_admissions"."provider_lease_expires_at" IS NULL AND "brand_analysis_admissions"."completed_at" IS NULL AND "brand_analysis_admissions"."failed_at" IS NOT NULL)
				));
--> statement-breakpoint
CREATE TABLE "elmo_runtime_generation" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"generation" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elmo_runtime_generation_singleton_check" CHECK ("elmo_runtime_generation"."singleton" = true)
);
--> statement-breakpoint
INSERT INTO "elmo_runtime_generation" ("singleton", "generation") VALUES (true, '0020');
