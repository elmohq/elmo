CREATE INDEX "prompt_runs_created_at_idx" ON "prompt_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prompt_runs_web_search_created_at_idx" ON "prompt_runs" USING btree ("web_search_enabled","created_at");--> statement-breakpoint
CREATE INDEX "prompts_brand_id_idx" ON "prompts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");