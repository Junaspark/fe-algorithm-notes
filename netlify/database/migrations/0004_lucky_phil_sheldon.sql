-- Legacy Agent jobs predate plan/submission associations and cannot be
-- correlated safely. They were never consumed by the old application, so
-- discard them before enforcing the runtime-required ownership columns.
DELETE FROM "agent_jobs";--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "plan_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "submission_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_jobs_submission_once" ON "agent_jobs" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_user_exercise_request_once" ON "submissions" USING btree ("user_id","exercise_id","request_id");
