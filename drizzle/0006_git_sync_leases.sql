ALTER TYPE "job_status" ADD VALUE IF NOT EXISTS 'dead';
ALTER TABLE "git_sync_jobs" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;
ALTER TABLE "git_sync_jobs" ADD COLUMN "worker_id" text;
ALTER TABLE "git_sync_jobs" ADD COLUMN "lease_token" uuid;
ALTER TABLE "git_sync_jobs" ADD COLUMN "lease_until" timestamp with time zone;
ALTER TABLE "git_sync_jobs" ADD COLUMN "expected_head_sha" text;
ALTER TABLE "git_sync_jobs" ADD COLUMN "commit_sha" text;
