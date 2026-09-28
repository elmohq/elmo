ALTER TABLE "brands" ADD COLUMN "domain" text;--> statement-breakpoint
-- Reduce each stored URL to the hostname the app already matched on: drop the
-- scheme, credentials, port, path/query/hash, and a leading "www.".
UPDATE "brands" SET "domain" = regexp_replace(
	lower(
		regexp_replace(
			regexp_replace(
				substring(regexp_replace(trim("website"), '^[a-z][a-z0-9+.-]*://', '', 'i') from '^[^/?#]*'),
				'^.*@', ''
			),
			':[0-9]*$', ''
		)
	),
	'^www\.', ''
);--> statement-breakpoint
ALTER TABLE "brands" ALTER COLUMN "domain" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" DROP COLUMN "website";
