CREATE TYPE "public"."exercise_kind" AS ENUM('algorithm', 'frontend');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plan_item_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('passed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"payload_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" text NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "exercise_kind" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "git_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"plan_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"position" integer NOT NULL,
	"status" "plan_item_status" DEFAULT 'pending' NOT NULL,
	"submission_id" uuid,
	"completed_at" timestamp with time zone,
	CONSTRAINT "plan_items_plan_id_exercise_id_pk" PRIMARY KEY("plan_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"submission_id" uuid,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"code" text NOT NULL,
	"status" "submission_status" NOT NULL,
	"test_result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_sync_jobs" ADD CONSTRAINT "git_sync_jobs_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_daily_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plans_one_active_per_user" ON "daily_plans" USING btree ("user_id") WHERE "daily_plans"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plans_user_local_date" ON "daily_plans" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_user_exercise" ON "drafts" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_items_position" ON "plan_items" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "submissions_user_exercise" ON "submissions" USING btree ("user_id","exercise_id");