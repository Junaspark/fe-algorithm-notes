CREATE TABLE "execution_attestations" (
  "nonce" text PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "exercise_id" text NOT NULL REFERENCES "exercises"("id"),
  "code_hash" text NOT NULL,
  "suite_version" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "execution_attestations_owner" ON "execution_attestations" USING btree ("user_id", "exercise_id");
