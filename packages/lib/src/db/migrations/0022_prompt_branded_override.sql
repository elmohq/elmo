ALTER TABLE "prompts" ADD COLUMN "branded_override" boolean;--> statement-breakpoint
-- A lone "branded" or "unbranded" user tag was the old override; carrying both meant neither.
UPDATE "prompts" p SET "branded_override" = f.has_branded
FROM (
	SELECT "id",
		EXISTS (SELECT 1 FROM unnest("tags") t WHERE lower(trim(t)) = 'branded') AS has_branded,
		EXISTS (SELECT 1 FROM unnest("tags") t WHERE lower(trim(t)) = 'unbranded') AS has_unbranded
	FROM "prompts"
) f
WHERE p."id" = f."id" AND f.has_branded <> f.has_unbranded;--> statement-breakpoint
UPDATE "prompts" SET "tags" = ARRAY(
	SELECT t FROM unnest("tags") WITH ORDINALITY AS u(t, i)
	WHERE lower(trim(t)) NOT IN ('branded', 'unbranded')
	ORDER BY i
)
WHERE EXISTS (SELECT 1 FROM unnest("tags") t WHERE lower(trim(t)) IN ('branded', 'unbranded'));--> statement-breakpoint
ALTER TABLE "prompts" DROP COLUMN "system_tags";
