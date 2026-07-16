ALTER TABLE "submissions" ADD COLUMN "request_id" text;
ALTER TABLE "agent_jobs" ADD COLUMN "plan_id" uuid;
ALTER TABLE "agent_jobs" ADD COLUMN "submission_id" uuid;
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id");
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id");
CREATE UNIQUE INDEX "submissions_user_exercise_request_once" ON "submissions" USING btree ("user_id", "exercise_id", "request_id");
CREATE UNIQUE INDEX "agent_jobs_submission_once" ON "agent_jobs" USING btree ("submission_id");
