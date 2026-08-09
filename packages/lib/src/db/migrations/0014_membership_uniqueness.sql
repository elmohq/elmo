-- Better-auth models one membership per (organization, user), but the schema
-- shipped only non-unique indexes, so the whitelabel Auth0 sync — which runs
-- both on sign-in and on a 15-minute worker schedule — could insert duplicate
-- member rows under a read-then-insert race. This migration deduplicates any
-- existing rows and adds the missing unique index so the race is impossible
-- going forward (the app-side per-user advisory lock in auth-sync.ts is the
-- fast path; this constraint is the backstop).
--
-- Bounded so it can never stall a live local/whitelabel deployment: the lock
-- is held only for this migration, and both timeouts fail fast rather than
-- blocking application traffic indefinitely.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '5min';
--> statement-breakpoint
-- Keep the most-privileged, then oldest, then lowest-id row per pair; delete
-- the rest. Deterministic, so a re-run (already-deduped) deletes nothing.
WITH ranked_members AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "organization_id", "user_id"
			ORDER BY
				CASE "role"
					WHEN 'owner' THEN 0
					WHEN 'admin' THEN 1
					WHEN 'member' THEN 2
					ELSE 3
				END,
				"created_at" ASC,
				"id" ASC
		) AS duplicate_rank
	FROM "member"
)
DELETE FROM "member"
USING ranked_members
WHERE "member"."id" = ranked_members."id"
	AND ranked_members.duplicate_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "member_organization_id_user_id_uidx"
	ON "member" USING btree ("organization_id", "user_id");
--> statement-breakpoint
-- Reset timeouts to defaults so later migrations in the same run are not
-- constrained by these bounded values (drizzle-kit applies pending migrations
-- over a single connection).
SET lock_timeout = DEFAULT;
--> statement-breakpoint
SET statement_timeout = DEFAULT;
