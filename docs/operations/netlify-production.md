# Netlify production runbook

This checklist promotes the personal gym to `https://fe-algorithm-gym.netlify.app` on Netlify site `901b1baf-beca-4688-b0c8-24d5da2b9a80`. Run it from a clean checkout of PR #1. Stop at the first failed gate; a deploy preview is not production approval.

## 1. Operator shell and site binding

Use a shell whose history is disabled for secret entry. Do not paste command output containing credentials into tickets, commits, or this document.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dlx netlify-cli login
pnpm dlx netlify-cli status
pnpm dlx netlify-cli link --id 901b1baf-beca-4688-b0c8-24d5da2b9a80
pnpm dlx netlify-cli status
```

The final status must name `fe-algorithm-gym`. Confirm PR #1 CI is green and record its commit SHA outside the secret store:

```bash
gh pr checks 1 --repo Junaspark/fe-algorithm-notes
gh pr view 1 --repo Junaspark/fe-algorithm-notes --json headRefOid,url
```

## 2. Secret inventory

Generate values locally; each command writes only to the terminal. Store the result directly in Netlify's encrypted environment-variable UI or with `netlify env:set`. Never add the values to `.env`, shell scripts, automation prompts, or Git.

```bash
openssl rand -base64 48 # AUTH_SECRET
openssl rand -hex 32    # CRON_SECRET
openssl rand -hex 32    # EXECUTION_ATTESTATION_SECRET
openssl rand -hex 32    # AGENT_BRIDGE_SECRET
```

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
| `OWNER_USER_ID` | identifier | database user UUID after the first authorized login |
| `GITHUB_REPOSITORY_OWNER` | configuration | `Junaspark` |
| `GITHUB_REPOSITORY_NAME` | configuration | `fe-algorithm-notes` |
| `GITHUB_SYNC_BRANCH` | safety control | `validation/promotion` until the final gate |
| `AGENT_ADAPTER` | configuration | `mock` for first production deploy |
| `NEXT_PUBLIC_APP_URL` | public configuration | `https://fe-algorithm-gym.netlify.app` |

For each non-database key, load the intended value into the same-named local shell variable, then set it without placing the value in the command itself:

```bash
pnpm dlx netlify-cli env:set AUTH_SECRET "$AUTH_SECRET" --context production
pnpm dlx netlify-cli env:set AUTH_GITHUB_ID "$AUTH_GITHUB_ID" --context production
pnpm dlx netlify-cli env:set AUTH_GITHUB_SECRET "$AUTH_GITHUB_SECRET" --context production
pnpm dlx netlify-cli env:set CRON_SECRET "$CRON_SECRET" --context production
pnpm dlx netlify-cli env:set EXECUTION_ATTESTATION_SECRET "$EXECUTION_ATTESTATION_SECRET" --context production
pnpm dlx netlify-cli env:set GITHUB_SYNC_TOKEN "$GITHUB_SYNC_TOKEN" --context production
pnpm dlx netlify-cli env:set AGENT_BRIDGE_SECRET "$AGENT_BRIDGE_SECRET" --context production
pnpm dlx netlify-cli env:set OWNER_USER_ID "$OWNER_USER_ID" --context production
pnpm dlx netlify-cli env:set GITHUB_REPOSITORY_OWNER "$GITHUB_REPOSITORY_OWNER" --context production
pnpm dlx netlify-cli env:set GITHUB_REPOSITORY_NAME "$GITHUB_REPOSITORY_NAME" --context production
pnpm dlx netlify-cli env:set GITHUB_SYNC_BRANCH "$GITHUB_SYNC_BRANCH" --context production
pnpm dlx netlify-cli env:set AGENT_ADAPTER "$AGENT_ADAPTER" --context production
pnpm dlx netlify-cli env:set NEXT_PUBLIC_APP_URL "$NEXT_PUBLIC_APP_URL" --context production
pnpm dlx netlify-cli env:list --context production
```

Review names and scopes only. Do not capture values. `DATABASE_URL` remains the portable override; never define it and `NETLIFY_DB_URL` with different databases.

## 3. Netlify Database, migrations, and seed

Check the linked database and prepare the nine canonical migrations. `drizzle/` is the only editable migration source.

```bash
pnpm dlx netlify-cli db status
pnpm netlify:migrations
test "$(find netlify/database/migrations -type f -name '*.sql' | wc -l | tr -d ' ')" = 9
git diff --exit-code -- drizzle
```

If no database is attached, provision Netlify Database for the linked site through the Netlify UI/CLI, then rerun `netlify db status`. Apply and seed with the production database URL injected into the operator shell by the secret manager:

```bash
DATABASE_URL="$NETLIFY_DB_URL" pnpm db:migrate
DATABASE_URL="$NETLIFY_DB_URL" pnpm seed
```

The seed command must print `19 exercises upserted`. Run the live repository integration gate with two independent PostgreSQL connections before continuing; redact connection strings from captured output.

```bash
DATABASE_URL="$NETLIFY_DB_URL" LIVE_DATABASE_URL="$NETLIFY_DB_URL" pnpm vitest run tests/db/repositories.integration.test.ts
```

## 4. GitHub OAuth gate

Create or update a GitHub OAuth App owned by `Junaspark`:

- Homepage URL: `https://fe-algorithm-gym.netlify.app`
- Authorization callback URL: `https://fe-algorithm-gym.netlify.app/api/auth/callback/github`

Put its client ID and client secret in Netlify as `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`. In the preview, verify `Junaspark` reaches `/today`; verify a different GitHub account reaches `/unauthorized`. A failed allowlist or callback test blocks promotion. The normal artifact must return 404 for E2E-only login/state routes.

## 5. Preview build and mobile acceptance

Build exactly as Netlify will and create a non-production deploy:

```bash
pnpm test
pnpm lint
pnpm tsc --noEmit
pnpm migration:compare
pnpm build:netlify
pnpm dlx netlify-cli deploy --build --alias validation
```

Record the deploy ID and HTTPS preview URL. On desktop and a phone, sign in, edit, run, submit, refresh/recover a draft, and finish one algorithm plus one frontend exercise. Confirm the Worker timeout recovery and `AGENT_ADAPTER=mock` review flow. Do not promote if mobile coding, running, or submission is incomplete.

## 6. Reminder and Codex Automation gate

Load `PREVIEW_URL` and `CRON_SECRET` into the operator shell without echoing either. Create an incomplete two-item plan, then invoke both endpoints:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$PREVIEW_URL/api/cron/morning"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$PREVIEW_URL/api/cron/evening"
```

The 09:30 and 20:00 responses must carry the same `planId` and only unfinished exercise IDs. The next 09:30 call must reuse that plan rather than create a new one.

Update the existing morning automation instead of duplicating it, and create one evening automation. Record identifiers after creation (IDs are operational metadata, not credentials):

```text
Codex Automation ID (09:30): <record-after-creation>
Codex Automation ID (20:00): <record-after-creation>
```

Both automations call the matching production endpoint, keep `CRON_SECRET` in their secret store, and publish only non-null `delivery.message`. Verify visible Codex task notifications on signed-in desktop and mobile clients. See `docs/cron-reminder-contract.md` for payload and deduplication rules.

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

Before merge, record the verified PR SHA, preview deploy ID, nine-migration count, seed count 19, both Codex Automation IDs, validation Git SHA, and current production deploy ID as the rollback target. Obtain owner approval, then merge PR #1 and deploy that exact merged SHA:

```bash
gh pr merge 1 --repo Junaspark/fe-algorithm-notes --merge
git fetch origin main
git switch --detach origin/main
pnpm dlx netlify-cli deploy --prod --build
```

Smoke-test `/login`, `/today`, a real Worker run, submission, and both cron endpoints. Only after every check passes, change Git sync from `validation/promotion` to `main`:

```bash
export GITHUB_SYNC_BRANCH=main
pnpm dlx netlify-cli env:set GITHUB_SYNC_BRANCH "$GITHUB_SYNC_BRANCH" --context production
```

Record non-secret evidence in `docs/operations/netlify-production-validation.md`.

## 9. Rollback

On a failed promotion, disable the two Codex automations and Git worker first. Keep the database and `validation/promotion` branch intact. Restore the recorded deploy:

```bash
pnpm dlx netlify-cli rollback "$ROLLBACK_DEPLOY_ID"
```

If the installed CLI exposes rollback through the deploy subcommand, run `pnpm dlx netlify-cli deploy:rollback "$ROLLBACK_DEPLOY_ID"`; confirm the active deploy in `netlify status`. Do not reverse database migrations blindly. Follow `docs/operations/recovery.md`, smoke-test the restored URL, then re-enable schedules only after OAuth and carry-over checks pass.
