CREATE INDEX "citations_prompt_run_id_idx" ON "citations" USING btree ("prompt_run_id");--> statement-breakpoint
CREATE INDEX "sentiment_observations_prompt_run_id_idx" ON "sentiment_observations" USING btree ("prompt_run_id");--> statement-breakpoint
CREATE INDEX "sentiment_observations_mention_id_idx" ON "sentiment_observations" USING btree ("mention_id");--> statement-breakpoint
CREATE INDEX "sentiment_provider_attempts_permit_id_idx" ON "sentiment_provider_attempts" USING btree ("permit_id");