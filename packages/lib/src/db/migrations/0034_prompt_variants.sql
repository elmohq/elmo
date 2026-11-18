ALTER TABLE "prompts" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_parent_id_prompts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompts_parent_id_idx" ON "prompts" USING btree ("parent_id");