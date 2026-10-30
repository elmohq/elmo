CREATE TABLE "brand_data_versions" (
	"brand_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	"version" bigint NOT NULL,
	CONSTRAINT "brand_data_versions_pk" PRIMARY KEY("brand_id","chunk_id")
);
--> statement-breakpoint
ALTER TABLE "brand_data_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_data_versions" ADD CONSTRAINT "brand_data_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
