CREATE TABLE "brand_analysis_admissions" (
	"brand_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"job_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"last_error" text,
	"provider_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_analysis_admissions_generation_check" CHECK ("brand_analysis_admissions"."generation" BETWEEN 1 AND 3),
	CONSTRAINT "brand_analysis_admissions_state_check" CHECK ((
				("brand_analysis_admissions"."status" = 'pending' AND "brand_analysis_admissions"."result" IS NULL AND "brand_analysis_admissions"."last_error" IS NULL AND "brand_analysis_admissions"."provider_started_at" IS NULL AND "brand_analysis_admissions"."completed_at" IS NULL AND "brand_analysis_admissions"."failed_at" IS NULL)
				OR ("brand_analysis_admissions"."status" = 'running' AND "brand_analysis_admissions"."result" IS NULL AND "brand_analysis_admissions"."last_error" IS NULL AND "brand_analysis_admissions"."provider_started_at" IS NOT NULL AND "brand_analysis_admissions"."completed_at" IS NULL AND "brand_analysis_admissions"."failed_at" IS NULL)
				OR ("brand_analysis_admissions"."status" = 'completed' AND "brand_analysis_admissions"."result" IS NOT NULL AND "brand_analysis_admissions"."last_error" IS NULL AND "brand_analysis_admissions"."provider_started_at" IS NOT NULL AND "brand_analysis_admissions"."completed_at" IS NOT NULL AND "brand_analysis_admissions"."failed_at" IS NULL)
				OR ("brand_analysis_admissions"."status" = 'failed' AND "brand_analysis_admissions"."result" IS NULL AND "brand_analysis_admissions"."last_error" IS NOT NULL AND "brand_analysis_admissions"."completed_at" IS NULL AND "brand_analysis_admissions"."failed_at" IS NOT NULL)
			))
);
--> statement-breakpoint
ALTER TABLE "brand_analysis_admissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_analysis_admissions" ADD CONSTRAINT "brand_analysis_admissions_brand_organization_fk" FOREIGN KEY ("brand_id","organization_id") REFERENCES "public"."brands"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_analysis_admissions_organization_idx" ON "brand_analysis_admissions" USING btree ("organization_id");