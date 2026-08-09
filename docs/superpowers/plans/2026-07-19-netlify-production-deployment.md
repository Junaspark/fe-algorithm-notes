# Netlify Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the personal frontend algorithm gym to Netlify with managed PostgreSQL, owner-only GitHub OAuth, verified mobile practice, Codex reminders at 09:30 and 20:00, and guarded Git synchronization.

**Architecture:** Preserve the existing provider-neutral Next.js, Drizzle, Auth.js, Agent, and Git boundaries. Add a small connection-string resolver for Netlify Database, generate Netlify migration inputs from the canonical Drizzle SQL files, and use Netlify only as the hosting/runtime adapter. Promote in stages: CI, preview, live database, OAuth, notifications, validation-branch Git export, then production.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Drizzle ORM, `postgres`, Netlify/OpenNext, Netlify Database, Auth.js GitHub provider, Vitest, Playwright, Codex Automations, GitHub Actions.

## Global Constraints

- Production URL is `https://fe-algorithm-gym.netlify.app`.
- Only normalized GitHub login `Junaspark` may access protected routes.
- Netlify Database uses the current Free account: 300 monthly credits, no payment method, automatic top-up disabled.
- `DATABASE_URL` remains the portable primary variable; `NETLIFY_DB_URL` is the Netlify fallback.
- E2E seams must remain unavailable in the normal production artifact.
- The application must not require an OpenAI API key; Agent integration remains provider-neutral.
- Codex task notifications are the only reminder delivery surface.
- Git synchronization first targets `validation/promotion`, never force-pushes, and only writes `exercises/`, `solutions/`, and `reports/`.
- An incomplete plan is reused at 09:30 and 20:00; no new plan is generated until both items are complete.
- Use TDD for every code change, run live gates before promotion, and commit each task independently.

---

## File map

- `db/connection-string.ts`: pure environment resolution with provider-neutral precedence.
- `db/client.ts`: construct the existing `postgres` client from the resolver.
- `drizzle.config.ts`: use the same resolver for CLI migrations.
- `scripts/prepare-netlify-migrations.ts`: copy canonical Drizzle SQL migrations into Netlify's expected directory deterministically.
- `tests/db/connection-string.test.ts`: resolver precedence and fail-closed behavior.
- `tests/deployment/netlify-migrations.test.ts`: migration ordering/content parity and stale-output removal.
- `netlify.toml`: Netlify build command, framework output, and production Node version.
- `.env.example`: complete key names only, never values.
- `docs/operations/netlify-production.md`: exact OAuth, database, preview, automation, Git promotion, and rollback commands.
- `.github/workflows/ci.yml`: verify Netlify migration preparation and retain production/E2E artifact separation.

### Task 1: Portable Netlify database connection

**Files:**
- Create: `db/connection-string.ts`
- Modify: `db/client.ts`
- Modify: `drizzle.config.ts`
- Modify: `.env.example`
- Test: `tests/db/connection-string.test.ts`

**Interfaces:**
- Produces: `resolveDatabaseUrl(env: Record<string, string | undefined>): string`
- Consumed by: application runtime, Drizzle CLI, Netlify preview and production.

- [ ] **Step 1: Write the failing resolver tests**

```ts
import { describe, expect, it } from 'vitest'
import { resolveDatabaseUrl } from '@/db/connection-string'

describe('resolveDatabaseUrl', () => {
  it('prefers the portable DATABASE_URL', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgres://portable', NETLIFY_DB_URL: 'postgres://netlify' }))
      .toBe('postgres://portable')
  })

  it('falls back to Netlify Database', () => {
    expect(resolveDatabaseUrl({ NETLIFY_DB_URL: 'postgres://netlify' })).toBe('postgres://netlify')
  })

  it('fails closed when neither variable exists', () => {
    expect(() => resolveDatabaseUrl({})).toThrow('DATABASE_URL or NETLIFY_DB_URL is required')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/db/connection-string.test.ts`

Expected: FAIL because `@/db/connection-string` does not exist.

- [ ] **Step 3: Implement the resolver and wire both callers**

```ts
// db/connection-string.ts
export function resolveDatabaseUrl(env: Record<string, string | undefined>): string {
  const value = env.DATABASE_URL?.trim() || env.NETLIFY_DB_URL?.trim()
  if (!value) throw new Error('DATABASE_URL or NETLIFY_DB_URL is required')
  return value
}
```

Use `resolveDatabaseUrl(process.env)` in `db/client.ts` and `drizzle.config.ts`. Add `NETLIFY_DB_URL=` plus all production key names from the approved deployment runbook to `.env.example`; commit no values.

- [ ] **Step 4: Verify the task**

Run: `pnpm vitest run tests/db/connection-string.test.ts tests/db/repositories.integration.test.ts`

Expected: resolver tests pass and repository integration remains green.

Run: `pnpm tsc --noEmit && pnpm lint`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add db/connection-string.ts db/client.ts drizzle.config.ts .env.example tests/db/connection-string.test.ts
git commit -m "feat: support Netlify database connections"
```

### Task 2: Canonical migrations and Netlify build adapter

**Files:**
- Create: `scripts/prepare-netlify-migrations.ts`
- Create: `tests/deployment/netlify-migrations.test.ts`
- Create: `netlify.toml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `prepareNetlifyMigrations(options?: { source?: string; destination?: string }): Promise<string[]>`
- Produces: `pnpm netlify:migrations` and `pnpm build:netlify`.
- Consumes: canonical `drizzle/0000_*.sql` through `drizzle/0008_*.sql`.

- [ ] **Step 1: Write failing migration parity tests**

```ts
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareNetlifyMigrations } from '@/scripts/prepare-netlify-migrations'

it('copies every canonical SQL migration in lexical order and removes stale output', async () => {
  const destination = await mkdtemp(path.join(os.tmpdir(), 'netlify-migrations-'))
  await writeFile(path.join(destination, 'stale.sql'), 'stale')
  const names = await prepareNetlifyMigrations({ destination })
  expect(names).toEqual((await readdir('drizzle')).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort())
  expect(await readdir(destination)).toEqual(names)
  for (const name of names) {
    expect(await readFile(path.join(destination, name), 'utf8'))
      .toBe(await readFile(path.join('drizzle', name), 'utf8'))
  }
})
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm vitest run tests/deployment/netlify-migrations.test.ts`

Expected: FAIL because the preparation module does not exist.

- [ ] **Step 3: Implement deterministic preparation**

Implement the exported function with `readdir`, `rm(destination, { recursive: true, force: true })`, `mkdir`, and `copyFile`. Select only filenames matching `/^\d{4}_.+\.sql$/`, reject an empty migration set, and ignore the Drizzle `meta/` directory. Keep `drizzle/` as the only editable migration source.

Add scripts:

```json
{
  "scripts": {
    "netlify:migrations": "tsx scripts/prepare-netlify-migrations.ts",
    "build:netlify": "pnpm netlify:migrations && next build"
  },
  "dependencies": {
    "@netlify/database": "1.1.0"
  }
}
```

`netlify.toml`:

```toml
[build]
command = "pnpm build:netlify"
publish = ".next"

[build.environment]
NODE_VERSION = "22"
PNPM_VERSION = "10.28.1"
```

Ignore the generated `netlify/database/migrations/` directory while retaining `netlify.toml`. Add `pnpm netlify:migrations` followed by the parity test to CI before builds.

- [ ] **Step 4: Verify the adapter**

Run: `pnpm netlify:migrations && pnpm vitest run tests/deployment/netlify-migrations.test.ts`

Expected: exactly nine ordered SQL files and passing parity test.

Run: `DATABASE_URL=http://unused.invalid AUTH_SECRET=build AUTH_GITHUB_ID=build AUTH_GITHUB_SECRET=build pnpm build:netlify`

Expected: normal production build succeeds with E2E seams compiled out.

Run: `pnpm test && pnpm lint && pnpm tsc --noEmit && pnpm migration:compare`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare-netlify-migrations.ts tests/deployment/netlify-migrations.test.ts netlify.toml package.json pnpm-lock.yaml .gitignore .github/workflows/ci.yml
git commit -m "feat: prepare Netlify production builds"
```

### Task 3: Production runbook and secret inventory

**Files:**
- Create: `docs/operations/netlify-production.md`
- Modify: `docs/operations/deployment.md`
- Test: `tests/deployment/netlify-runbook.test.ts`

**Interfaces:**
- Produces: an executable operator checklist for site `901b1baf-beca-4688-b0c8-24d5da2b9a80` without storing secret values.
- Consumes: Netlify CLI, GitHub OAuth App, PR #1, and Tasks 1-2 scripts.

- [ ] **Step 1: Write a failing runbook contract test**

```ts
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('documents every production gate without embedding secret values', async () => {
  const text = await readFile('docs/operations/netlify-production.md', 'utf8')
  for (const token of [
    'https://fe-algorithm-gym.netlify.app',
    '/api/auth/callback/github',
    'validation/promotion',
    'pnpm db:migrate',
    'pnpm seed',
    '09:30',
    '20:00',
    'Junaspark',
  ]) expect(text).toContain(token)
  expect(text).not.toMatch(/gh[opsu]_[A-Za-z0-9]{20,}/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run tests/deployment/netlify-runbook.test.ts`

Expected: FAIL because the runbook does not exist.

- [ ] **Step 3: Write the exact runbook**

Document commands for Netlify login/status/link, database status, migration preparation/application, seed count, environment variable names, preview deploy, OAuth callback, manual cron calls, Codex Automation IDs, validation-branch Git worker, rollback, and production promotion. Use environment-variable references only in command examples; never store actual secret values or OAuth credentials.

Document secret generation with local commands:

```bash
openssl rand -base64 48 # AUTH_SECRET
openssl rand -hex 32    # CRON_SECRET
openssl rand -hex 32    # EXECUTION_ATTESTATION_SECRET
openssl rand -hex 32    # AGENT_BRIDGE_SECRET
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm vitest run tests/deployment/netlify-runbook.test.ts && git diff --check`

Expected: PASS and no whitespace errors.

```bash
git add docs/operations/netlify-production.md docs/operations/deployment.md tests/deployment/netlify-runbook.test.ts
git commit -m "docs: add Netlify production runbook"
```

### Task 4: Netlify preview, database, and GitHub OAuth gates

**Files:**
- Modify only when evidence requires a fix: files from Tasks 1-3.
- Record evidence: `docs/operations/netlify-production-validation.md`

**Interfaces:**
- Produces: a deployed preview URL, migrated/seeded live PostgreSQL, and working owner-only OAuth.
- Consumes: Netlify site ID `901b1baf-beca-4688-b0c8-24d5da2b9a80` and GitHub OAuth credentials supplied through provider secret stores.

- [ ] **Step 1: Create the GitHub OAuth App**

Register homepage `https://fe-algorithm-gym.netlify.app` and callback `https://fe-algorithm-gym.netlify.app/api/auth/callback/github`. Store the client ID/secret directly in Netlify; never print or persist the secret in repository files.

- [ ] **Step 2: Configure non-Git secrets and safe initial modes**

Set `NEXT_PUBLIC_APP_URL`, `AUTH_SECRET`, OAuth credentials, `CRON_SECRET`, `EXECUTION_ATTESTATION_SECRET`, `OWNER_USER_ID`, `GITHUB_REPOSITORY_OWNER=Junaspark`, `GITHUB_REPOSITORY_NAME=fe-algorithm-notes`, `GITHUB_SYNC_BRANCH=validation/promotion`, and `AGENT_ADAPTER=mock`. Leave direct-to-main disabled.

- [ ] **Step 3: Provision and validate Netlify Database**

Install/provision via the approved Netlify Database workflow, apply all nine migrations, run `pnpm seed`, assert the seed reports `19 exercises upserted`, and run the repository integration suite against two independent live connections. Record timestamps and non-secret command results.

- [ ] **Step 4: Deploy preview and verify OAuth**

Run a draft Netlify deploy from the exact branch HEAD. Verify `Junaspark` reaches `/today`, a second GitHub account reaches `/unauthorized`, and `/api/e2e/state` plus `/api/e2e/login` return 404 in the normal artifact.

- [ ] **Step 5: Verify desktop/mobile practice**

On HTTPS desktop and phone viewports, complete one algorithm and one frontend exercise; run the real Worker, refresh, recover the draft, submit, and observe mock Agent output. Install the PWA on a phone and repeat a run/submit action using touch only.

- [ ] **Step 6: Record evidence and commit only documentation**

```bash
git add docs/operations/netlify-production-validation.md
git commit -m "docs: record Netlify preview validation"
```

### Task 5: Codex Automation delivery

**Files:**
- Modify: `docs/operations/netlify-production-validation.md`
- External state: existing Codex automation `每日前端题`; one new evening automation.

**Interfaces:**
- Produces: one active 09:30 morning automation and one active 20:00 evening automation for project `local-ce92bfc08f445d3f8c3029f164a90b54`.
- Consumes: production cron endpoints and `CRON_SECRET` from the deployment secret store.

- [ ] **Step 1: Update rather than duplicate the morning automation**

Rename `每日前端题` to `前端算法训练 09:30` and set it to run daily at 09:30 Asia/Shanghai. Its prompt calls `/api/cron/morning`, authenticates without exposing the secret in output, and publishes `delivery.message` only when non-null.

- [ ] **Step 2: Create the evening automation**

Create `前端算法训练 20:00`, daily at 20:00 Asia/Shanghai, calling `/api/cron/evening` with the same output and deduplication rules.

- [ ] **Step 3: Verify carry-over semantics**

Create an incomplete plan, invoke morning and evening manually, and assert both payloads contain the same `planId` and only remaining exercise IDs. Invoke the next morning and assert no new plan was created.

- [ ] **Step 4: Verify notification surfaces**

Confirm one visible test notification on the signed-in Codex desktop client and one on the signed-in mobile client. Record automation IDs, timestamps, plan ID, and delivery IDs without recording secrets.

- [ ] **Step 5: Commit evidence**

```bash
git add docs/operations/netlify-production-validation.md
git commit -m "docs: verify Codex reminder delivery"
```

### Task 6: Git validation, CI closure, and production promotion

**Files:**
- Modify: `docs/operations/netlify-production-validation.md`
- External state: GitHub PR #1, validation branch, Netlify production deploy.

**Interfaces:**
- Produces: green PR, inspected Git export, merged `main`, production deployment, and `GITHUB_SYNC_BRANCH=main`.
- Consumes: Tasks 1-5 validated preview and the repository-scoped GitHub token.

- [ ] **Step 1: Validate Git synchronization off main**

Create `validation/promotion` from current `main`. Configure the Git worker token and run one completed-plan export. Assert the resulting diff changes only `exercises/`, `solutions/`, and `reports/`. Advance the branch separately and assert the stale job becomes retryable with `REMOTE_HEAD_CHANGED` rather than overwriting.

- [ ] **Step 2: Run the final verification matrix**

Run:

```bash
pnpm test
pnpm lint
pnpm tsc --noEmit
pnpm migration:compare
DATABASE_URL=http://unused.invalid AUTH_SECRET=build AUTH_GITHUB_ID=build AUTH_GITHUB_SECRET=build pnpm build:netlify
E2E_COMPILE=1 DATABASE_URL=http://unused.invalid AUTH_SECRET=e2e AUTH_GITHUB_ID=e2e AUTH_GITHUB_SECRET=e2e pnpm build
pnpm playwright test
git diff --check
```

Expected: all commands exit 0; Vitest and Playwright report zero failures.

- [ ] **Step 3: Wait for GitHub Actions and independent review**

Require both push and pull-request `verify` checks green at the same HEAD. Request an independent final code review and resolve every Critical or Important finding before promotion.

- [ ] **Step 4: Request owner approval for merge**

Present the preview URL, validation evidence, CI results, automation delivery evidence, and remaining minor risks. Do not merge until the owner explicitly approves.

- [ ] **Step 5: Merge and deploy production**

Merge PR #1 into `main`, deploy the merged SHA to Netlify production, smoke-test `/login`, `/today`, one Worker run, and both cron endpoints, then change `GITHUB_SYNC_BRANCH` from `validation/promotion` to `main`.

- [ ] **Step 6: Final record**

Record the merged SHA, production deploy ID/URL, migration count, seed count, automation IDs, validation Git SHA, and rollback target in `docs/operations/netlify-production-validation.md`. Commit and push the operational record if it contains no secrets.
