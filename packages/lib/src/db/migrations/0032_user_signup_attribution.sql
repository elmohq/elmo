CREATE TABLE "user_signup_attribution" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ref" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"click_ids" jsonb,
	"landing_page" text,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_signup_attribution" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_signup_attribution" ADD CONSTRAINT "user_signup_attribution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;