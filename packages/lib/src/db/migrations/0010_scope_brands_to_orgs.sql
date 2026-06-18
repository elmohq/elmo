-- Scope brands to organizations (issue #339).
--
-- Adds brands.organization_id as a hard FK to the better-auth `organization`
-- table. Org membership is already the access-control mechanism; this makes the
-- brand -> org relationship explicit (the prerequisite for cloud entitlements,
-- metering, and enforcement) instead of relying on the implicit `brand.id ==
-- organization.id` convention.
--
-- Backfill assigns every brand to the org that shares its id, so existing
-- local / demo / whitelabel installs upgrade with zero manual steps and keep
-- behaving identically (each brand stays mapped to its own org — NOT collapsed
-- into a single shared default org, which would hide brands from their members
-- in multi-org whitelabel / multi-brand local deployments).

-- Fail fast rather than queue behind a long-running query / worker insert.
SET lock_timeout = '5s';
SET statement_timeout = '15min';

-- Step 1: add the column nullable so existing rows can be backfilled before the
-- NOT NULL + FK constraints are enforced. No default -> metadata-only, instant.
ALTER TABLE "brands" ADD COLUMN "organization_id" text;--> statement-breakpoint

-- Step 2: ensure every brand has a matching organization row. In all current
-- deployments a brand's id already equals an existing org id, so this inserts
-- nothing. The defensive case is a brand created via the admin API before its
-- org was synced (whitelabel, where orgs arrive from Auth0 on first login): we
-- materialize the missing org (id == slug == brand id) so the FK holds and the
-- brand stays mapped to its own org. Whitelabel Auth0 sync later upserts the
-- same id idempotently (correcting name/slug) and attaches membership.
INSERT INTO "organization" ("id", "name", "slug", "created_at")
SELECT b."id", b."name", b."id", now()
FROM "brands" b
WHERE NOT EXISTS (SELECT 1 FROM "organization" o WHERE o."id" = b."id")
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Step 3: backfill — each brand belongs to the org that shares its id.
UPDATE "brands" SET "organization_id" = "id" WHERE "organization_id" IS NULL;--> statement-breakpoint

-- Step 4: enforce going forward.
ALTER TABLE "brands" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brands_organization_id_idx" ON "brands" USING btree ("organization_id");
