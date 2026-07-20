DROP INDEX IF EXISTS "agent_jobs_submission_once";--> statement-breakpoint
ALTER TABLE "agent_jobs" ALTER COLUMN "submission_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "job_type" text;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "worker_id" text;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
UPDATE "agent_jobs"
SET "job_type" = payload->>'jobType',
    "idempotency_key" = payload->>'idempotencyKey',
    "attempt" = COALESCE((payload->>'attempt')::integer, 1);--> statement-breakpoint
DELETE FROM "agent_jobs"
WHERE "job_type" NOT IN ('review-submission', 'select-exercises')
   OR "idempotency_key" IS NULL
   OR ("job_type" = 'review-submission' AND "submission_id" IS NULL);--> statement-breakpoint
DELETE FROM "agent_jobs" newer
USING "agent_jobs" older
WHERE newer."user_id" = older."user_id"
  AND newer."idempotency_key" = older."idempotency_key"
  AND (newer."created_at", newer."id") > (older."created_at", older."id");--> statement-breakpoint
ALTER TABLE "agent_jobs" ALTER COLUMN "job_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_jobs" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_jobs_review_submission_once" ON "agent_jobs" USING btree ("submission_id") WHERE "job_type" = 'review-submission' AND "submission_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_jobs_owner_idempotency_once" ON "agent_jobs" USING btree ("user_id","idempotency_key");
