DROP INDEX "provider_call_reservations_work_idx";--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "submission_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_call_reservations" ADD COLUMN "retry_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "provider_plan" json;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "provider_call_budget" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_call_reservations_work_idx" ON "provider_call_reservations" USING btree ("owner_type","owner_id","work_key","attempt_number");--> statement-breakpoint
INSERT INTO "worker_scheduler_control" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_legacy_paid_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE admission_open boolean;
BEGIN
	IF TG_OP = 'INSERT' AND NEW.name IN ('generate-report-v2', 'analyze-brand-v2') THEN
		-- Handoff holds this row exclusively while reconciling queued work. New
		-- paid admissions wait outside pg-boss until that snapshot is complete.
		SELECT legacy_prompt_admission_open INTO admission_open
		FROM public.worker_scheduler_control
		WHERE id = 'global'
		FOR SHARE;
		RETURN NEW;
	END IF;

	IF NEW.name IN ('process-prompt', 'generate-report', 'analyze-brand') THEN
		-- Once closed, reject without taking the control lock. An old worker may
		-- already hold this job row, and handoff takes control -> job row order.
		SELECT legacy_prompt_admission_open INTO admission_open
		FROM public.worker_scheduler_control
		WHERE id = 'global';

		IF COALESCE(admission_open, false) = true THEN
			SELECT legacy_prompt_admission_open INTO admission_open
			FROM public.worker_scheduler_control
			WHERE id = 'global'
			FOR SHARE;
		END IF;

		IF COALESCE(admission_open, false) = false THEN
			IF TG_OP = 'INSERT' AND NEW.state NOT IN ('retry', 'failed') THEN
				RAISE EXCEPTION 'legacy paid-work admission is permanently closed' USING ERRCODE = '55000';
			ELSIF TG_OP = 'UPDATE' AND NEW.state = 'active' AND OLD.state IS DISTINCT FROM 'active' THEN
				RAISE EXCEPTION 'legacy paid-work admission is permanently closed' USING ERRCODE = '55000';
			END IF;
		END IF;
	END IF;
	RETURN NEW;
END
$function$;--> statement-breakpoint
DO $block$
BEGIN
	IF to_regclass('pgboss.job') IS NOT NULL THEN
		EXECUTE 'DROP TRIGGER IF EXISTS reject_legacy_prompt_admission ON pgboss.job';
		EXECUTE 'DROP TRIGGER IF EXISTS reject_legacy_paid_admission ON pgboss.job';
		EXECUTE 'CREATE TRIGGER reject_legacy_paid_admission
			BEFORE INSERT OR UPDATE ON pgboss.job
			FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_paid_admission()';
	END IF;
END
$block$;
