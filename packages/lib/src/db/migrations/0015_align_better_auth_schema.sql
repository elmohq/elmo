DROP INDEX "organization_slug_uidx";--> statement-breakpoint
ALTER TABLE "sso_provider" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "status" SET NOT NULL;