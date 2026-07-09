-- Scope brands to organizations (issue #339).
--
-- Adds brands.organization_id as a hard FK to the better-auth `organization`
-- table. Org membership is already the access-control mechanism; this makes the
-- brand -> org relationship explicit (the prerequisite for cloud entitlements,
-- metering, and enforcement) instead of relying on the implicit `brand.id ==
-- organization.id` convention.
--
-- Backfill assigns every brand to the org that shares its id (1:1), so existing
-- local / demo / whitelabel installs upgrade with zero manual steps and keep
-- behaving identically — each brand stays mapped to its own org, NOT collapsed
-- into a single shared default org (which would hide brands from their members
-- in multi-org whitelabel / multi-brand local deployments). Every brand already
-- has a matching org row, so the FK below holds with no extra work.

-- Fail fast rather than queue behind a long-running query / worker insert.
SET lock_timeout = '5s';
SET statement_timeout = '15min';

-- Step 1: add the column nullable so existing rows can be backfilled before the
-- NOT NULL + FK constraints are enforced. No default -> metadata-only, instant.
ALTER TABLE "brands" ADD COLUMN "organization_id" text;--> statement-breakpoint

-- Step 2: backfill — each brand belongs to the org that shares its id.
UPDATE "brands" SET "organization_id" = "id" WHERE "organization_id" IS NULL;--> statement-breakpoint

-- Step 3: enforce going forward.
ALTER TABLE "brands" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brands_organization_id_idx" ON "brands" USING btree ("organization_id");
