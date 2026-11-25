CREATE TABLE "member_brand_pin" (
	"member_id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_brand_pin" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_brand_pin" ADD CONSTRAINT "member_brand_pin_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_brand_pin" ADD CONSTRAINT "member_brand_pin_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;