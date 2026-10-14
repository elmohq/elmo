CREATE TABLE "api_key_brands" (
	"api_key_id" text NOT NULL,
	"brand_id" text NOT NULL,
	CONSTRAINT "api_key_brands_api_key_id_brand_id_pk" PRIMARY KEY("api_key_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "api_key_brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "api_key_grants" (
	"api_key_id" text PRIMARY KEY NOT NULL,
	"all_brands" boolean NOT NULL,
	"created_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "api_key_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_key_brands" ADD CONSTRAINT "api_key_brands_api_key_id_apikey_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_brands" ADD CONSTRAINT "api_key_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_grants" ADD CONSTRAINT "api_key_grants_api_key_id_apikey_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_grants" ADD CONSTRAINT "api_key_grants_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_brands_brand_idx" ON "api_key_brands" USING btree ("brand_id");--> statement-breakpoint
-- Carry each existing key's brand narrowing over from `metadata`, read the way
-- the app read it: no `brandIds` is every brand, anything unreadable reaches
-- nothing, and a brand outside the key's organization is dropped. Older plugin
-- versions double-encoded the column, so a JSON string is unwrapped once.
DO $$
DECLARE
	key_row record;
	parsed jsonb;
BEGIN
	FOR key_row IN SELECT id, reference_id, metadata FROM apikey LOOP
		parsed := NULL;
		IF key_row.metadata IS NOT NULL THEN
			BEGIN
				parsed := key_row.metadata::jsonb;
				IF jsonb_typeof(parsed) = 'string' THEN
					parsed := (parsed #>> '{}')::jsonb;
				END IF;
			EXCEPTION WHEN others THEN
				parsed := '{"brandIds": null}'::jsonb;
			END;
		END IF;

		IF parsed IS NULL OR jsonb_typeof(parsed) <> 'object' OR NOT parsed ? 'brandIds' THEN
			INSERT INTO api_key_grants (api_key_id, all_brands) VALUES (key_row.id, true);
		ELSE
			INSERT INTO api_key_grants (api_key_id, all_brands) VALUES (key_row.id, false);
			IF jsonb_typeof(parsed -> 'brandIds') = 'array' THEN
				INSERT INTO api_key_brands (api_key_id, brand_id)
				SELECT DISTINCT key_row.id, b.id
				FROM jsonb_array_elements_text(parsed -> 'brandIds') AS ids(brand_id)
				JOIN brands b ON b.id = ids.brand_id AND b.organization_id = key_row.reference_id;
			END IF;
		END IF;
	END LOOP;
END $$;
