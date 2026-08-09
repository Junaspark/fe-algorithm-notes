# Netlify production runbook

This checklist promotes the personal gym to `https://fe-algorithm-gym.netlify.app` on Netlify site `901b1baf-beca-4688-b0c8-24d5da2b9a80`. Run it from a clean checkout of PR #1. Stop at the first failed gate; a deploy preview is not production approval.

## 1. Operator shell and site binding

Use a private shell with tracing disabled. The commands below put generated values in shell variables without placing values in shell history or terminal output. Do not run `set -x`, echo a secret variable, or paste credential-bearing output into tickets, commits, or this document.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --package=netlify-cli dlx netlify login
pnpm --package=netlify-cli dlx netlify status
pnpm --package=netlify-cli dlx netlify link --id 901b1baf-beca-4688-b0c8-24d5da2b9a80
pnpm --package=netlify-cli dlx netlify status
```

The final status must name `fe-algorithm-gym`. Confirm PR #1 CI is green and record its commit SHA outside the secret store:

```bash
gh pr checks 1 --repo Junaspark/fe-algorithm-notes
gh pr view 1 --repo Junaspark/fe-algorithm-notes --json headRefOid,url
```

## 2. Secret inventory

Generate values directly into non-exported shell variables. These exact generators satisfy the entropy requirement without printing the result:

```bash
AUTH_SECRET="$(openssl rand -base64 48)" # AUTH_SECRET
CRON_SECRET="$(openssl rand -hex 32)" # CRON_SECRET
EXECUTION_ATTESTATION_SECRET="$(openssl rand -hex 32)" # EXECUTION_ATTESTATION_SECRET
AGENT_BRIDGE_SECRET="$(openssl rand -hex 32)" # AGENT_BRIDGE_SECRET
```

Store every generated secret in the password manager before the first unset. Create named entries for the site and paste each variable through the password manager's protected input (or its stdin integration), confirm all four entries can be retrieved, and only then continue. The password manager is the source for reloading the exact same values for `deploy-preview`, production redeploys, Codex automations, and rotations; never regenerate a value merely because its shell variable was cleared.

Required production keys:

| Key | Classification | Initial production setting |
| --- | --- | --- |
| `NETLIFY_DB_URL` or `DATABASE_URL` | secret | Netlify Database connection; prefer the provisioned `NETLIFY_DB_URL` |
| `AUTH_SECRET` | secret | generated locally |
| `AUTH_GITHUB_ID` | confidential identifier | GitHub OAuth App client ID |
| `AUTH_GITHUB_SECRET` | secret | GitHub OAuth App client secret |
| `CRON_SECRET` | secret | generated locally |
| `EXECUTION_ATTESTATION_SECRET` | secret | generated locally |
| `GITHUB_SYNC_TOKEN` | secret | repository-only token for `Junaspark/fe-algorithm-notes` |
| `AGENT_BRIDGE_SECRET` | secret | generated locally; retained while mock is active |
| `CODEX_BRIDGE_URL` | confidential endpoint | leave unset while mock is active |
| `OWNER_USER_ID` | optional identifier override | leave unset for normal operation; set only to override automatic owner resolution |
| `GITHUB_REPOSITORY_OWNER` | configuration | `Junaspark` |
| `GITHUB_REPOSITORY_NAME` | configuration | `fe-algorithm-notes` |
| `GITHUB_SYNC_BRANCH` | safety control | `validation/promotion` until the final gate |
| `AGENT_ADAPTER` | configuration | `mock` for first production deploy |
| `NEXT_PUBLIC_APP_URL` | public configuration | `https://fe-algorithm-gym.netlify.app` |

Load all other sensitive values into same-named, non-exported shell variables with a silent prompt (`read -rs 'AUTH_GITHUB_SECRET?GitHub client secret: '` in zsh). Set them from variable references, then immediately `unset` each local secret. The literal secret is absent from history; while each CLI process runs it is necessarily present in that process's argument list. For a host where other users can inspect process arguments, use the Netlify UI instead.

Set the production scope first. Leave `OWNER_USER_ID` unset unless an operational override is specifically required. Scheduled jobs normally look up the unique normalized `Junaspark` user row after the first authorized login; zero, duplicate, or malformed matches fail closed with `EXPECTED_ONE_OWNER_USER`.

```bash
pnpm --package=netlify-cli dlx netlify env:set AUTH_SECRET "$AUTH_SECRET" --context production
pnpm --package=netlify-cli dlx netlify env:set AUTH_GITHUB_ID "$AUTH_GITHUB_ID" --context production
pnpm --package=netlify-cli dlx netlify env:set AUTH_GITHUB_SECRET "$AUTH_GITHUB_SECRET" --context production
pnpm --package=netlify-cli dlx netlify env:set CRON_SECRET "$CRON_SECRET" --context production
pnpm --package=netlify-cli dlx netlify env:set EXECUTION_ATTESTATION_SECRET "$EXECUTION_ATTESTATION_SECRET" --context production
pnpm --package=netlify-cli dlx netlify env:set GITHUB_SYNC_TOKEN "$GITHUB_SYNC_TOKEN" --context production
pnpm --package=netlify-cli dlx netlify env:set AGENT_BRIDGE_SECRET "$AGENT_BRIDGE_SECRET" --context production
pnpm --package=netlify-cli dlx netlify env:set GITHUB_REPOSITORY_OWNER "$GITHUB_REPOSITORY_OWNER" --context production
pnpm --package=netlify-cli dlx netlify env:set GITHUB_REPOSITORY_NAME "$GITHUB_REPOSITORY_NAME" --context production
pnpm --package=netlify-cli dlx netlify env:set GITHUB_SYNC_BRANCH "$GITHUB_SYNC_BRANCH" --context production
pnpm --package=netlify-cli dlx netlify env:set AGENT_ADAPTER "$AGENT_ADAPTER" --context production
pnpm --package=netlify-cli dlx netlify env:set NEXT_PUBLIC_APP_URL "$NEXT_PUBLIC_APP_URL" --context production
unset AUTH_SECRET AUTH_GITHUB_SECRET CRON_SECRET EXECUTION_ATTESTATION_SECRET GITHUB_SYNC_TOKEN AGENT_BRIDGE_SECRET
```

Verify key names and scopes in **Netlify UI → Project configuration → Environment variables**; do not use a CLI command that prints values. `DATABASE_URL` remains the portable override; never define it and `NETLIFY_DB_URL` with different databases.

## 3. Netlify Database and migrations

Check the linked database and prepare the twelve canonical migrations. `drizzle/` is the canonical migration source. Migration versions are positive and contiguous (`0001` through `0012`) because Netlify reserves version `0000` as its initial maximum and rejects a user migration numbered `0000` as out of order. `0010_seed_exercises.sql` is the immutable baseline. `0011_exercise_catalog_state.sql` adds catalog lifecycle state, and the latest monotonic `*_sync_exercises.sql` migration deterministically represents exactly 19 canonical exercises in `exercises/*.json`.

The twelve SQL snapshots in `netlify/database/migrations/` are checked in because Netlify reads and applies them before the build command. They must already match `drizzle/` byte-for-byte in the deployed commit. `pnpm build:netlify` only verifies/prepares those files and runs `next build`; it never opens a database connection in a local, CLI, preview, branch, or production build. If exercise JSON changes intentionally, run `pnpm exercise:migration` once: it selects the next unused four-digit migration number and refuses to overwrite history. The migration archives rows absent from the canonical 19 by setting `active=false`, then upserts the current catalog as active. Archived rows remain addressable by historical plans, submissions, drafts, and reviews, but library and future plan selection exclude them. Review and commit the JSON, new canonical SQL, Drizzle journal entry, and regenerated Netlify snapshots together. CI rejects uncovered JSON drift and migration byte drift.

Next sets `NEXT_PHASE=phase-production-build` while compiling. If a Netlify deploy has not injected its branch database URL into that build process, application configuration uses a non-routable build-only sentinel so static compilation can finish; no build step connects to it. The exception is unavailable in production-server, development, CLI migration, and ordinary runtime phases, where a missing `DATABASE_URL` or `NETLIFY_DB_URL` still fails immediately. Runtime functions therefore still require the branch database binding.

```bash
pnpm --package=netlify-cli dlx netlify db status
pnpm netlify:migrations
test "$(find netlify/database/migrations -type f -name '*.sql' | wc -l | tr -d ' ')" = 12
git diff --exit-code -- drizzle netlify/database/migrations
```

If no database is attached, provision Netlify Database for the linked site through the Netlify UI/CLI, then rerun `netlify db status`. Netlify applies all twelve migrations, including the idempotent active-catalog sync, before it starts the build. For an explicit operator-managed recovery or local database, apply the same migration set with the database URL injected by the secret manager:

```bash
DATABASE_URL="$NETLIFY_DB_URL" pnpm db:migrate
```

Run the purpose-built live gate after migration application. It requires exactly 19 canonical exercises, opens two separate `postgres` clients and Drizzle databases, requires different `pg_backend_pid()` values, and concurrently calls the production `createPlanRepository` transaction from both connections for one probe owner. Exactly one transaction must commit, the other must surface the repository's retryable `ACTIVE_PLAN_EXISTS` boundary, and both repositories must then read the same active plan. The gate deletes its probe plan through the schema's cascade and closes both clients. The URL remains a shell variable and the script never prints it.

```bash
DATABASE_URL="$NETLIFY_DB_URL" pnpm tsx scripts/verify-live-database.ts
```

## 4. GitHub OAuth gate

Create or update the production GitHub OAuth App owned by `Junaspark`:

- Homepage URL: `https://fe-algorithm-gym.netlify.app`
- Authorization callback URL: `https://fe-algorithm-gym.netlify.app/api/auth/callback/github`

Put its client ID and client secret in Netlify's **production** context as `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`. GitHub OAuth requires an exact callback, so a random deploy-preview URL cannot truthfully validate this production callback. Section 5 therefore uses the stable validation alias with a separate validation OAuth App and deploy-preview credentials; the production app is exercised immediately after the controlled production deploy and must pass before schedules or direct-to-main are enabled.

## 5. Preview build and mobile acceptance

Create a second GitHub OAuth App whose homepage is `https://validation--fe-algorithm-gym.netlify.app` and callback is `https://validation--fe-algorithm-gym.netlify.app/api/auth/callback/github`. Reload every referenced sensitive variable from the password manager with silent `read -rs` prompts, load the validation credentials separately, set them only for the `deploy-preview` context, and use the stable validation alias:

```bash
VALIDATION_APP_URL=https://validation--fe-algorithm-gym.netlify.app
pnpm --package=netlify-cli dlx netlify env:set AUTH_SECRET "$AUTH_SECRET" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set AUTH_GITHUB_ID "$VALIDATION_AUTH_GITHUB_ID" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set AUTH_GITHUB_SECRET "$VALIDATION_AUTH_GITHUB_SECRET" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set CRON_SECRET "$CRON_SECRET" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set EXECUTION_ATTESTATION_SECRET "$EXECUTION_ATTESTATION_SECRET" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set GITHUB_SYNC_TOKEN "$GITHUB_SYNC_TOKEN" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set AGENT_BRIDGE_SECRET "$AGENT_BRIDGE_SECRET" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set GITHUB_REPOSITORY_OWNER "$GITHUB_REPOSITORY_OWNER" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set GITHUB_REPOSITORY_NAME "$GITHUB_REPOSITORY_NAME" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set GITHUB_SYNC_BRANCH "$GITHUB_SYNC_BRANCH" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set AGENT_ADAPTER "$AGENT_ADAPTER" --context deploy-preview
pnpm --package=netlify-cli dlx netlify env:set NEXT_PUBLIC_APP_URL "$VALIDATION_APP_URL" --context deploy-preview
unset AUTH_SECRET VALIDATION_AUTH_GITHUB_SECRET CRON_SECRET EXECUTION_ATTESTATION_SECRET GITHUB_SYNC_TOKEN AGENT_BRIDGE_SECRET
```

Confirm in the Netlify UI that the provisioned database variable is available to deploy previews. If it is production-only, add the same database to `deploy-preview` scope in the UI without displaying its value.

Build exactly as Netlify will and create a non-production deploy:

```bash
pnpm test
pnpm lint
pnpm tsc --noEmit
pnpm migration:compare
pnpm build:netlify
pnpm --package=netlify-cli dlx netlify deploy --build --alias validation --context deploy-preview
```

Record the deploy ID and verify its URL is exactly `https://validation--fe-algorithm-gym.netlify.app`. Sign in as `Junaspark`. The scheduled runtimes resolve the single normalized `Junaspark` database row automatically, so no owner-ID discovery, environment update, or redeploy is needed. If the lookup finds zero, duplicate, or malformed rows, it fails closed with `EXPECTED_ONE_OWNER_USER`. Verify `Junaspark` reaches `/today` and a different GitHub account reaches `/unauthorized`. On desktop and a phone, edit, run, submit, refresh/recover a draft, and finish one algorithm plus one frontend exercise. Confirm the Worker timeout recovery and `AGENT_ADAPTER=mock` review flow. The normal artifact must return 404 for E2E-only login/state routes. Do not promote if any gate fails.

## 6. Reminder and Codex Automation gate

Set the non-secret preview origin and reload `CRON_SECRET` from the password manager without echoing it. Create an incomplete two-item plan, then invoke both endpoints:

```bash
PREVIEW_URL=https://validation--fe-algorithm-gym.netlify.app
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$PREVIEW_URL/api/cron/morning"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$PREVIEW_URL/api/cron/evening"
```

The 09:30 and 20:00 responses must carry the same `planId` and only unfinished exercise IDs. The next 09:30 call must reuse that plan rather than create a new one.

Update the existing morning automation instead of duplicating it, and create one evening automation. Point both at the stable validation origin (`https://validation--fe-algorithm-gym.netlify.app/api/cron/morning` and `/api/cron/evening`) with the preview-context `CRON_SECRET`. Keep both schedules disabled so a preview cannot send an unattended reminder. Use each automation's manual **Run now** action, and require its non-null `delivery.message` to appear visibly on signed-in desktop and mobile clients before promotion. Record identifiers after creation (IDs are operational metadata, not credentials):

```text
Codex Automation ID (09:30): <record-after-creation>
Codex Automation ID (20:00): <record-after-creation>
```

Both automations keep `CRON_SECRET` in their secret store and publish only non-null `delivery.message`. At this stage their target remains validation and their schedules remain disabled. See `docs/cron-reminder-contract.md` for payload and deduplication rules.

## 7. Validation-branch Git worker

Create `validation/promotion` from the current remote `main`, and keep `GITHUB_SYNC_BRANCH=validation/promotion`:

```bash
git fetch origin main
git push origin origin/main:refs/heads/validation/promotion
GITHUB_SYNC_BRANCH="$GITHUB_SYNC_BRANCH" pnpm tsx scripts/process-git-sync.ts
git fetch origin validation/promotion
git diff --name-only origin/main...origin/validation/promotion
```

The diff may contain files only under `exercises/`, `solutions/`, and `reports/`. Independently advance the validation branch, replay a job with its prior expected SHA, and require retryable `REMOTE_HEAD_CHANGED`; never force-push. Record the accepted validation commit SHA.

## 8. Promotion

Before merge, record the verified PR SHA, preview deploy ID, twelve-migration count, active exercise count 19, both Codex Automation IDs, validation Git SHA, and current production deploy ID as the rollback target. Obtain owner approval, then merge PR #1 and deploy that exact merged SHA:

```bash
gh pr merge 1 --repo Junaspark/fe-algorithm-notes --merge
git fetch origin main
git switch --detach origin/main
pnpm --package=netlify-cli dlx netlify deploy --prod --build --context production
```

Sign in to the production URL as `Junaspark`. The production scheduled runtimes resolve the single normalized owner row automatically; leave `OWNER_USER_ID` unset unless an explicit operational override is needed. Verify `Junaspark` reaches `/today`, another account is denied, then smoke-test a real Worker run, submission, and both production cron endpoints manually. After those production gates pass, Switch both automation endpoint URLs to production (`https://fe-algorithm-gym.netlify.app/api/cron/morning` and `/api/cron/evening`), reload the production `CRON_SECRET` from the password manager into their secret store, and use **Run now** once more. Require visible desktop/mobile delivery from the production endpoints before changing schedule state. Enable both schedules only after this production notification check succeeds. Finally change Git sync from `validation/promotion` to `main`:

```bash
export GITHUB_SYNC_BRANCH=main
pnpm --package=netlify-cli dlx netlify env:set GITHUB_SYNC_BRANCH "$GITHUB_SYNC_BRANCH" --context production
```

Record non-secret evidence in `docs/operations/netlify-production-validation.md`.

## 9. Rollback

On a failed promotion, disable the two Codex automations and Git worker first. Keep the database and `validation/promotion` branch intact. The supported operator path is **Netlify UI → Deploys → select the recorded successful deploy → Publish deploy**:

`https://app.netlify.com/projects/fe-algorithm-gym/deploys/`

For an audited API restore, silently read a short-lived Netlify personal access token and call the documented restore endpoint. Neither token nor deploy ID is written literally into history:

```bash
read -rs 'NETLIFY_AUTH_TOKEN?Netlify token: '
curl --fail-with-body --silent --show-error --request POST \
  --header "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
  "https://api.netlify.com/api/v1/sites/901b1baf-beca-4688-b0c8-24d5da2b9a80/deploys/$ROLLBACK_DEPLOY_ID/restore"
unset NETLIFY_AUTH_TOKEN
pnpm --package=netlify-cli dlx netlify status
```

Confirm the published deploy ID in the UI. Do not reverse database migrations blindly. Follow `docs/operations/recovery.md`, smoke-test the restored URL, then re-enable schedules only after OAuth and carry-over checks pass.
