CREATE TYPE "public"."tag_type" AS ENUM('system', 'user');--> statement-breakpoint
CREATE TABLE "prompt_tag_assignments" (
	"prompt_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_tag_assignments_prompt_id_tag_id_pk" PRIMARY KEY("prompt_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "prompt_tag_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prompt_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"tag_type" "tag_type" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prompt_tag_assignments" ADD CONSTRAINT "prompt_tag_assignments_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_tag_assignments" ADD CONSTRAINT "prompt_tag_assignments_tag_id_prompt_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."prompt_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_tags" ADD CONSTRAINT "prompt_tags_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_tag_assignments_prompt_id_idx" ON "prompt_tag_assignments" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "prompt_tag_assignments_tag_id_idx" ON "prompt_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "prompt_tags_brand_id_idx" ON "prompt_tags" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "prompt_tags_brand_id_name_idx" ON "prompt_tags" USING btree ("brand_id","name");