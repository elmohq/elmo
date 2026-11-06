-- "branded" and "unbranded" user tags were overrides of the stored classification; the type is now always derived.
UPDATE "prompts" SET "tags" = ARRAY(
	SELECT t FROM unnest("tags") WITH ORDINALITY AS u(t, i)
	WHERE lower(trim(t)) NOT IN ('branded', 'unbranded')
	ORDER BY i
)
WHERE EXISTS (SELECT 1 FROM unnest("tags") t WHERE lower(trim(t)) IN ('branded', 'unbranded'));--> statement-breakpoint
ALTER TABLE "prompts" DROP COLUMN "system_tags";
