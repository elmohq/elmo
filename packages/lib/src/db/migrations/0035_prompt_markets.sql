CREATE TABLE "prompt_translations" (
	"brand_id" text NOT NULL,
	"market" text NOT NULL,
	"source_hash" text NOT NULL,
	"translation" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_translations_pk" PRIMARY KEY("brand_id","market","source_hash")
);
--> statement-breakpoint
ALTER TABLE "prompt_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "country" text DEFAULT 'US' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "prompt_translations" ADD CONSTRAINT "prompt_translations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;