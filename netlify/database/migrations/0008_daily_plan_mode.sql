CREATE TYPE "public"."plan_mode" AS ENUM('practice', 'timed');
ALTER TABLE "daily_plans" ADD COLUMN "mode" "plan_mode" DEFAULT 'practice' NOT NULL;
