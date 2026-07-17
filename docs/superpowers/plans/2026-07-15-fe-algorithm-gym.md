# FE Algorithm Gym Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `fe-algorithm-notes` into a personal, mobile-capable daily JavaScript interview training PWA with GitHub-only access, safe browser judging, durable progress, scheduled reminders, GitHub export, and a provider-neutral coaching Agent boundary.

**Architecture:** Use a Next.js App Router application as the UI and backend-for-frontend, PostgreSQL with Drizzle for durable state, Auth.js GitHub OAuth for the single-user gate, and a Web Worker for untrusted JavaScript execution. Domain services depend on repositories and provider-neutral ports; GitHub export and model Agents are adapters behind those ports.

**Tech Stack:** Next.js App Router, React, TypeScript for application code, JavaScript for exercises, Auth.js, PostgreSQL, Drizzle ORM, Zod, Monaco Editor, Vitest, Testing Library, Playwright, Octokit, pnpm.

## Global Constraints

- Time zone is exactly `Asia/Shanghai`.
- A new plan contains exactly two JavaScript exercises: one `algorithm` and one `frontend`.
- At most one incomplete daily plan may exist; 09:30 reuses it and 20:00 reminds it without creating another plan.
- GitHub OAuth must reject every login whose normalized handle is not exactly `junaspark`.
- Exercise code runs only in a browser Web Worker with a hard timeout; the server never evaluates submitted JavaScript.
- A plan is complete only when both exercises pass their full test suites.
- GitHub automation may write only `exercises/`, `solutions/`, and `reports/`, directly to `main` after both exercises are complete.
- The application consumes only schema-validated Agent results and must remain functional with the Codex adapter disabled.
- The 19 legacy exercises must retain code, status, complexity, mistakes, and interview questions.
- Follow the current App Router and Route Handler conventions documented at https://nextjs.org/docs/app and https://nextjs.org/docs/app/getting-started/route-handlers.

---

## File Structure

```text
app/
  (auth)/login/page.tsx                 GitHub sign-in screen
  (protected)/layout.tsx                Session and handle gate
  (protected)/today/page.tsx            Current daily plan
  (protected)/practice/[id]/page.tsx    Responsive practice workspace
  (protected)/library/page.tsx          Searchable exercise library
  (protected)/mistakes/page.tsx         Review queue
  (protected)/progress/page.tsx         Weekly progress
  api/auth/[...nextauth]/route.ts        Auth.js Route Handler
  api/drafts/route.ts                    Draft persistence
  api/submissions/route.ts               Submission persistence
  api/cron/morning/route.ts              09:30 plan/reminder endpoint
  api/cron/evening/route.ts              20:00 reminder endpoint
  api/agent/jobs/[id]/result/route.ts     Agent result callback
components/practice/
  PracticeWorkspace.tsx                 Desktop split/mobile tabs
  CodeEditor.tsx                         Monaco wrapper
  TestResults.tsx                        Runner output
  RuleFeedback.tsx                       Deterministic feedback
db/
  schema.ts                              Drizzle tables/enums
  client.ts                              Database connection
domain/
  exercises/schema.ts                   Exercise Zod contract
  plans/service.ts                       Plan generation/reuse policy
  submissions/service.ts                 Completion and review policy
  reminders/service.ts                   Notification commands
  agents/contracts.ts                    Versioned Agent envelopes/results
  agents/orchestrator.ts                 Provider-neutral job lifecycle
  git/export.ts                          Whitelisted export manifest
adapters/
  agents/codex-bridge.ts                 Async Codex job bridge
  agents/mock-agent.ts                   Contract-test adapter
  github/repository.ts                   Octokit writer
  notifications/port.ts                  Notification interface
  notifications/recording.ts             Test adapter
workers/
  runner.worker.ts                       Isolated JavaScript execution
  runner-client.ts                       Timeout/termination client
scripts/
  migrate-legacy-data.mjs                Convert `data.js` to exercise JSON
  seed.ts                                Insert canonical exercises
exercises/                               Versioned canonical exercise JSON
solutions/                               Exported accepted solutions
reports/                                 Exported weekly reports
tests/                                   Unit, integration, contract, e2e
```

---

### Task 1: Application foundation and legacy exercise contract

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `app/layout.tsx`, `app/page.tsx`
- Create: `domain/exercises/schema.ts`, `scripts/migrate-legacy-data.mjs`
- Create: `tests/exercises/schema.test.ts`, `tests/fixtures/legacy-data.js`
- Modify: `.github/workflows/pages.yml` (remove static Pages deployment; replace in Task 9)
- Preserve until migration verification: `data.js`, `app.js`, `index.html`, `styles.css`

**Interfaces:**
- Produces: `ExerciseSchema`, `Exercise`, `ExerciseKind`, and canonical files `exercises/*.json`.

- [ ] **Step 1: Add the package and toolchain manifests**

```json
{
  "name": "fe-algorithm-gym",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "@auth/drizzle-adapter": "latest",
    "@monaco-editor/react": "latest",
    "@octokit/rest": "latest",
    "drizzle-orm": "latest",
    "next": "latest",
    "next-auth": "beta",
    "postgres": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "drizzle-kit": "latest",
    "eslint": "latest",
    "eslint-config-next": "latest",
    "jsdom": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  },
  "packageManager": "pnpm@10"
}
```

Run: `pnpm install`  
Expected: lockfile created and install exits 0. Commit the resolved lockfile; never leave floating versions in CI.

- [ ] **Step 2: Write the failing exercise-schema test**

```ts
// tests/exercises/schema.test.ts
import { describe, expect, it } from 'vitest'
import { ExerciseSchema } from '@/domain/exercises/schema'

describe('ExerciseSchema', () => {
  it('requires JavaScript tests and interview metadata', () => {
    const result = ExerciseSchema.safeParse({ id: 'promise-all', language: 'javascript' })
    expect(result.success).toBe(false)
  })

  it('accepts a complete algorithm exercise', () => {
    expect(ExerciseSchema.parse({
      id: 'unique-array', title: '数组去重', kind: 'algorithm', difficulty: 'easy',
      language: 'javascript', topics: ['array'], prompt: '实现 uniqueArray',
      starterCode: 'function uniqueArray(values) {}',
      publicTests: [{ name: 'deduplicates', args: [[1, 1, 2]], expected: [1, 2] }],
      hiddenTests: [], legacy: { status: '已通过', complexity: 'O(n)', mistakes: [], questions: [] },
    }).id).toBe('unique-array')
  })
})
```

- [ ] **Step 3: Run the test and verify the expected failure**

Run: `pnpm vitest run tests/exercises/schema.test.ts`  
Expected: FAIL because `domain/exercises/schema.ts` does not exist.

- [ ] **Step 4: Implement the canonical contract**

```ts
// domain/exercises/schema.ts
import { z } from 'zod'

export const TestCaseSchema = z.object({
  name: z.string().min(1), args: z.array(z.unknown()), expected: z.unknown(), timeoutMs: z.number().int().min(50).max(3000).default(1000),
})
export const ExerciseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), title: z.string().min(1),
  kind: z.enum(['algorithm', 'frontend']), difficulty: z.enum(['easy', 'medium', 'hard']),
  language: z.literal('javascript'), topics: z.array(z.string()).min(1), prompt: z.string().min(1),
  starterCode: z.string(), publicTests: z.array(TestCaseSchema).min(1), hiddenTests: z.array(TestCaseSchema),
  legacy: z.object({ status: z.string(), complexity: z.string(), mistakes: z.array(z.string()), questions: z.array(z.string()) }).optional(),
})
export type Exercise = z.infer<typeof ExerciseSchema>
export type ExerciseKind = Exercise['kind']
```

- [ ] **Step 5: Implement migration and verify all 19 records**

`scripts/migrate-legacy-data.mjs` must load `data.js` in a VM with a fake `window`, map numeric IDs to stable slugs, classify categories into `algorithm` or `frontend`, preserve every legacy field, and write one JSON file per item. Add a final assertion:

```js
if (migrated.length !== 19) throw new Error(`Expected 19 exercises, got ${migrated.length}`)
```

Run: `node scripts/migrate-legacy-data.mjs && pnpm vitest run tests/exercises/schema.test.ts`  
Expected: 19 JSON files and all tests PASS.

- [ ] **Step 6: Build the minimal App Router shell**

Create `app/layout.tsx` with Chinese metadata and `app/page.tsx` redirecting authenticated product traffic later to `/today`. Run `pnpm build`; expected exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts vitest.config.ts app domain scripts tests exercises .github/workflows/pages.yml
git commit -m "feat: establish exercise platform foundation"
```

---

### Task 2: Durable training data and repositories

**Files:**
- Create: `db/schema.ts`, `db/client.ts`, `drizzle.config.ts`, `scripts/seed.ts`
- Create: `domain/plans/repository.ts`, `domain/submissions/repository.ts`
- Test: `tests/db/schema.test.ts`, `tests/db/repositories.integration.test.ts`

**Interfaces:**
- Consumes: `Exercise` from Task 1.
- Produces: `PlanRepository`, `SubmissionRepository`, and tables `exercises`, `daily_plans`, `plan_items`, `drafts`, `submissions`, `reviews`, `agent_jobs`, `git_sync_jobs`.

- [ ] **Step 1: Write repository contract tests**

```ts
// tests/db/repositories.integration.test.ts
it('enforces one incomplete plan and preserves draft versions', async () => {
  const first = await plans.create({ userId, localDate: '2026-07-15', exerciseIds: ['a', 'b'] })
  await expect(plans.create({ userId, localDate: '2026-07-16', exerciseIds: ['c', 'd'] })).rejects.toThrow('ACTIVE_PLAN_EXISTS')
  await drafts.save({ userId, exerciseId: 'a', code: 'v1', expectedVersion: 0 })
  await expect(drafts.save({ userId, exerciseId: 'a', code: 'v2', expectedVersion: 0 })).rejects.toThrow('DRAFT_CONFLICT')
  expect(first.status).toBe('active')
})
```

- [ ] **Step 2: Run the integration test and verify failure**

Run: `pnpm vitest run tests/db/repositories.integration.test.ts`  
Expected: FAIL because schema and repositories are missing.

- [ ] **Step 3: Define focused Drizzle tables**

Use UUID primary keys, `timestamp with time zone` for instants, a `local_date` string for Shanghai plan dates, JSONB only for versioned exercise/test and Agent payloads, and explicit status enums. Add a partial unique index on `(user_id)` where `daily_plans.status = 'active'`. Add unique `(user_id, exercise_id)` for current drafts with integer `version`.

- [ ] **Step 4: Implement repositories with transactions**

```ts
export interface PlanRepository {
  findActive(userId: string): Promise<DailyPlan | null>
  create(input: CreatePlanInput): Promise<DailyPlan>
  markItemComplete(planId: string, exerciseId: string, submissionId: string): Promise<DailyPlan>
}
export interface DraftRepository {
  save(input: { userId: string; exerciseId: string; code: string; expectedVersion: number }): Promise<Draft>
  find(userId: string, exerciseId: string): Promise<Draft | null>
}
```

Translate unique-index failures to `ACTIVE_PLAN_EXISTS`; update drafts with `WHERE version = expectedVersion`, incrementing version, and throw `DRAFT_CONFLICT` when zero rows update.

- [ ] **Step 5: Generate and apply migrations**

Run: `pnpm db:generate && pnpm db:migrate && pnpm seed`  
Expected: migrations exit 0 and seed reports `19 exercises inserted`.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm vitest run tests/db`  
Expected: PASS.

```bash
git add db drizzle.config.ts domain scripts tests
git commit -m "feat: add durable training data model"
```

---

### Task 3: GitHub OAuth single-user gate

**Files:**
- Create: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/(auth)/login/page.tsx`, `app/(protected)/layout.tsx`
- Create: `domain/auth/authorize-github-user.ts`
- Test: `tests/auth/authorize-github-user.test.ts`, `tests/auth/protected-layout.test.tsx`

**Interfaces:**
- Produces: `authorizeGitHubUser(profile): boolean`, authenticated session `session.user.githubLogin`.

- [ ] **Step 1: Write the allowlist test**

```ts
import { expect, it } from 'vitest'
import { authorizeGitHubUser } from '@/domain/auth/authorize-github-user'

it('allows only Junaspark case-insensitively', () => {
  expect(authorizeGitHubUser({ login: 'Junaspark' })).toBe(true)
  expect(authorizeGitHubUser({ login: 'junaspark' })).toBe(true)
  expect(authorizeGitHubUser({ login: 'other' })).toBe(false)
  expect(authorizeGitHubUser({ login: undefined })).toBe(false)
})
```

- [ ] **Step 2: Verify failure, then implement the pure gate**

Run: `pnpm vitest run tests/auth/authorize-github-user.test.ts`  
Expected: FAIL missing module.

```ts
export function authorizeGitHubUser(profile: { login?: string | null }): boolean {
  return profile.login?.trim().toLowerCase() === 'junaspark'
}
```

- [ ] **Step 3: Configure Auth.js**

Configure the GitHub provider, Drizzle adapter, database sessions, and a `signIn` callback that calls `authorizeGitHubUser`. Copy `profile.login` into the JWT/session callback as `githubLogin`; never authorize from display name or email. Route all protected pages through `app/(protected)/layout.tsx`, redirecting absent sessions to `/login` and mismatched handles to `/unauthorized`.

- [ ] **Step 4: Add environment validation**

Create `env.ts` with Zod requiring `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, and `DATABASE_URL`. Add only key names to `.env.example`; do not commit values.

- [ ] **Step 5: Test and commit**

Run: `pnpm vitest run tests/auth && pnpm build`  
Expected: tests PASS and build exits 0.

```bash
git add auth.ts app domain/auth tests/auth env.ts .env.example
git commit -m "feat: restrict access to Junaspark GitHub login"
```

---

### Task 4: Daily-plan policy and reminder endpoints

**Files:**
- Create: `domain/plans/service.ts`, `domain/plans/selector.ts`, `domain/reminders/service.ts`
- Create: `adapters/notifications/port.ts`, `adapters/notifications/recording.ts`
- Create: `app/api/cron/morning/route.ts`, `app/api/cron/evening/route.ts`
- Test: `tests/plans/service.test.ts`, `tests/reminders/service.test.ts`, `tests/api/cron.test.ts`

**Interfaces:**
- Produces: `runMorningCheck(now)`, `runEveningCheck(now)`, `ExerciseSelector.select(profile)`.

- [ ] **Step 1: Write policy tests for carry-over and exact composition**

```ts
it('reuses an incomplete plan instead of generating new exercises', async () => {
  plans.findActive.mockResolvedValue(activePlan)
  expect(await service.runMorningCheck(new Date('2026-07-16T01:30:00Z'))).toMatchObject({ planId: activePlan.id, created: false })
  expect(selector.select).not.toHaveBeenCalled()
  expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ planId: activePlan.id }))
})

it('creates one algorithm and one frontend exercise when none is active', async () => {
  plans.findActive.mockResolvedValue(null)
  selector.select.mockResolvedValue([algorithmExercise, frontendExercise])
  const result = await service.runMorningCheck(new Date('2026-07-16T01:30:00Z'))
  expect(result.created).toBe(true)
  expect(result.plan.items.map(item => item.kind).sort()).toEqual(['algorithm', 'frontend'])
})
```

- [ ] **Step 2: Verify failure and implement policy**

Run: `pnpm vitest run tests/plans tests/reminders`  
Expected: FAIL missing services.

Implement `runMorningCheck` as: find active plan; if found notify remaining items and return it; otherwise select one due review per kind, then weak-topic candidate, then unseen candidate, create atomically, notify. Implement `runEveningCheck` to notify only when an active plan remains. Use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })` to derive `localDate`.

- [ ] **Step 3: Protect cron Route Handlers**

Require `Authorization: Bearer ${CRON_SECRET}` with constant-time comparison. Morning and evening handlers call their service once and return `{ planId, created, remainingCount }`. Return 401 for missing/wrong tokens.

- [ ] **Step 4: Test exact schedules and commit**

Route scheduling belongs to deployment configuration: `30 1 * * *` UTC for 09:30 Shanghai and `0 12 * * *` UTC for 20:00 Shanghai. Tests must freeze clock at both instants and assert no plan duplication.

Run: `pnpm vitest run tests/plans tests/reminders tests/api/cron.test.ts`  
Expected: PASS.

```bash
git add domain/plans domain/reminders adapters/notifications app/api/cron tests
git commit -m "feat: schedule persistent daily practice plans"
```

---

### Task 5: Safe JavaScript runner and deterministic feedback

**Files:**
- Create: `workers/runner.protocol.ts`, `workers/runner.worker.ts`, `workers/runner-client.ts`
- Create: `domain/submissions/rule-feedback.ts`
- Test: `tests/workers/runner.test.ts`, `tests/submissions/rule-feedback.test.ts`

**Interfaces:**
- Produces: `runTests(request, timeoutMs): Promise<RunResult>` and `buildRuleFeedback(result): RuleFeedback`.

- [ ] **Step 1: Define and test the worker protocol**

```ts
export type RunRequest = { requestId: string; code: string; exportName: string; tests: TestCase[] }
export type TestResult = { name: string; status: 'passed' | 'failed' | 'error' | 'timeout'; durationMs: number; expected?: unknown; actual?: unknown; error?: string }
export type RunResult = { requestId: string; tests: TestResult[]; logs: string[]; durationMs: number }
```

Test success, assertion mismatch, syntax error, thrown error, rejected Promise, and `while(true){}` timeout. The timeout test must also run a second valid request afterward to prove the terminated Worker was replaced.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run tests/workers/runner.test.ts`  
Expected: FAIL missing worker client.

- [ ] **Step 3: Implement worker isolation**

The client creates a Worker per run, starts a hard timer, terminates on result or timeout, and resolves a synthetic timeout result. The Worker shadows `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`, and `localStorage` before evaluating code; captures bounded console output; invokes only the named exported function; awaits Promise results; and serializes errors. Document that this is client isolation for UX, not a server trust boundary.

- [ ] **Step 4: Implement deterministic feedback**

`buildRuleFeedback` must report passed/total, failing test names, timeout/syntax categories, boundary hints derived only from exercise-authored test metadata, and the learner's complexity self-assessment. It must never label this output “AI review”.

- [ ] **Step 5: Test and commit**

Run: `pnpm vitest run tests/workers tests/submissions`  
Expected: PASS.

```bash
git add workers domain/submissions tests/workers tests/submissions
git commit -m "feat: run JavaScript exercises in a bounded worker"
```

---

### Task 6: Responsive practice workspace, drafts, and submissions

**Files:**
- Create: `components/practice/PracticeWorkspace.tsx`, `CodeEditor.tsx`, `TestResults.tsx`, `RuleFeedback.tsx`
- Create: `app/(protected)/today/page.tsx`, `app/(protected)/practice/[id]/page.tsx`
- Create: `app/api/drafts/route.ts`, `app/api/submissions/route.ts`
- Create: `app/manifest.ts`, `public/sw.js`, `components/ServiceWorkerRegistration.tsx`
- Test: `tests/components/PracticeWorkspace.test.tsx`, `tests/api/drafts.test.ts`, `tests/api/submissions.test.ts`, `tests/e2e/mobile-practice.spec.ts`

**Interfaces:**
- Consumes: runner, repositories, session, active daily plan.
- Produces: complete desktop/mobile practice flow and versioned draft API.

- [ ] **Step 1: Write UI behavior tests**

Test desktop renders `题目` and `代码编辑器` simultaneously; mobile renders tabs `题目`, `代码`, `结果`; typing schedules save after 2 seconds; `DRAFT_CONFLICT` displays a recovery choice; Run shows public results; Submit sends full result evidence and marks complete only when the server accepts it.

- [ ] **Step 2: Verify failure**

Run: `pnpm vitest run tests/components/PracticeWorkspace.test.tsx tests/api`  
Expected: FAIL missing workspace and routes.

- [ ] **Step 3: Implement draft routes and offline queue**

`PUT /api/drafts` validates `{ exerciseId, code, expectedVersion }`, derives user ID from session, and returns `{ version, savedAt }`. Client stores unsent operations in IndexedDB under key `${userId}:${exerciseId}` and retries on `online`; it never stores session secrets. Conflict response is HTTP 409 with server and local versions.

- [ ] **Step 4: Implement submission route**

Validate exercise ID, code, client run evidence, complexity answer, and elapsed seconds. Recompute only structural eligibility server-side; never execute code. Persist submission and, when every supplied full test is passed, atomically mark the plan item complete. When both items complete, enqueue one Git sync job and one Agent review job per submission.

- [ ] **Step 5: Build responsive workspace and PWA shell**

Use CSS Grid above 900px for 42/58 split; below 900px use accessible tabs with a sticky Run/Submit bar. Monaco loads client-side, uses JavaScript mode, 16px minimum font on mobile, formats on demand, and restores latest draft. Manifest uses `display: standalone`; service worker caches only the application shell and static exercise metadata, never authenticated API responses.

- [ ] **Step 6: Run component, API, mobile e2e, and accessibility checks**

Run: `pnpm vitest run tests/components tests/api && pnpm playwright test tests/e2e/mobile-practice.spec.ts`  
Expected: PASS at desktop 1440×900 and mobile 390×844.

- [ ] **Step 7: Commit**

```bash
git add app components public domain/submissions tests
git commit -m "feat: add responsive daily practice workspace"
```

---

### Task 7: Provider-neutral Agent jobs and Codex bridge

**Files:**
- Create: `domain/agents/contracts.ts`, `domain/agents/port.ts`, `domain/agents/orchestrator.ts`
- Create: `adapters/agents/codex-bridge.ts`, `adapters/agents/mock-agent.ts`
- Create: `app/api/agent/jobs/[id]/result/route.ts`
- Test: `tests/agents/contracts.test.ts`, `tests/agents/orchestrator.test.ts`, `tests/agents/adapter-contract.ts`, `tests/agents/mock-agent.test.ts`

**Interfaces:**
- Produces: `AgentAdapter.dispatch(job)`, `getResult(jobId)`, `healthCheck()`, version `agent-job.v1`.

- [ ] **Step 1: Write adapter contract tests**

```ts
export function agentAdapterContract(makeAdapter: () => AgentAdapter) {
  it('is idempotent and returns schema-valid results', async () => {
    const adapter = makeAdapter()
    await adapter.dispatch(reviewJob)
    await adapter.dispatch(reviewJob)
    const result = await adapter.getResult(reviewJob.id)
    expect(AgentResultSchema.parse(result).jobId).toBe(reviewJob.id)
  })
}
```

Also test invalid schema rejection, timeout to `retryable`, maximum attempts, provider/model/prompt metadata, and fallback to deterministic review without mutating mastery.

- [ ] **Step 2: Verify failure and implement versioned contracts**

Run: `pnpm vitest run tests/agents`  
Expected: FAIL missing contracts.

Define `AgentJobSchema` with `schemaVersion: 'agent-job.v1'`, `jobType: 'select-exercises' | 'review-submission'`, sanitized context, attempt, deadline, and idempotency key. Define separate discriminated result payloads and a maximum serialized size of 64 KiB.

- [ ] **Step 3: Implement orchestrator and mock adapter**

The orchestrator persists before dispatch, validates results before storing, records adapter/model/prompt versions, rejects unknown fields with strict Zod objects, and never lets raw text directly update mastery or Git export. Mock adapter returns deterministic fixtures and is used by all product-flow tests.

- [ ] **Step 4: Implement Codex async bridge**

The bridge exposes pending jobs through the authenticated application boundary and accepts signed callbacks at `/api/agent/jobs/[id]/result`. Verify `AGENT_BRIDGE_SECRET`, job ID, idempotency key, deadline, and Schema. No OpenAI API key is present. Document the Codex scheduled-task prompt in `docs/agent/codex-bridge.md`, including exact fetch, result, retry, and stop behavior.

- [ ] **Step 5: Run contract tests with Codex disabled**

Run: `AGENT_ADAPTER=mock pnpm vitest run tests/agents tests/api tests/components`  
Expected: PASS, proving the application does not depend on Codex.

- [ ] **Step 6: Commit**

```bash
git add domain/agents adapters/agents app/api/agent docs/agent tests/agents
git commit -m "feat: add provider-neutral coaching agent bridge"
```

---

### Task 8: Safe direct-to-main GitHub export

**Files:**
- Create: `domain/git/export.ts`, `domain/git/paths.ts`
- Create: `adapters/github/repository.ts`, `scripts/process-git-sync.ts`
- Test: `tests/git/export.test.ts`, `tests/git/repository.test.ts`, `tests/fixtures/github-tree.json`

**Interfaces:**
- Produces: `buildExportManifest(completedPlan)`, `GitHubRepository.commitToMain(manifest, expectedHeadSha)`.

- [ ] **Step 1: Write path and conflict tests**

```ts
it.each(['app/page.tsx', '.github/workflows/x.yml', '../secret', 'solutions/../../x'])('rejects %s', path => {
  expect(() => assertExportPath(path)).toThrow('EXPORT_PATH_NOT_ALLOWED')
})

it('stops when remote main changed', async () => {
  github.getHeadSha.mockResolvedValue('remote-new')
  await expect(repository.commitToMain(manifest, 'recorded-old')).rejects.toThrow('REMOTE_HEAD_CHANGED')
  expect(github.createCommit).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Verify failure and implement whitelist**

Run: `pnpm vitest run tests/git`  
Expected: FAIL missing modules.

Normalize with POSIX rules; reject absolute paths, `..`, dot-prefixed root segments, and anything outside exactly `exercises/`, `solutions/`, or `reports/`. Build JSON/JavaScript/Markdown from structured records, never from Agent-provided paths.

- [ ] **Step 3: Implement one atomic Git data commit**

Using Octokit Git Data API: read `main` ref, compare SHA, read base tree, create blobs, create tree, create commit with message `practice: complete YYYY-MM-DD daily exercises`, then fast-forward `heads/main` without force. On 409/422 or changed SHA, keep `GitSyncJob` retryable and do not overwrite.

- [ ] **Step 4: Verify manifest snapshot and retry behavior**

Run: `pnpm vitest run tests/git`  
Expected: PASS and snapshots contain no draft, token, session, hidden test, or raw Agent payload.

- [ ] **Step 5: Commit**

```bash
git add domain/git adapters/github scripts/process-git-sync.ts tests/git
git commit -m "feat: export completed practice safely to GitHub"
```

---

### Task 9: Library, mistakes, progress, deployment, and full acceptance

**Files:**
- Create: `app/(protected)/library/page.tsx`, `mistakes/page.tsx`, `progress/page.tsx`
- Create: `domain/progress/metrics.ts`, `domain/reviews/schedule.ts`
- Create: `tests/progress/metrics.test.ts`, `tests/reviews/schedule.test.ts`
- Create: `tests/e2e/daily-loop.spec.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/offline.spec.ts`
- Create: `.github/workflows/ci.yml`, `docs/operations/deployment.md`, `docs/operations/recovery.md`
- Modify: `README.md`, remove legacy runtime files only after migration comparison passes.

**Interfaces:**
- Consumes all prior tasks.
- Produces the complete deployable and documented product.

- [ ] **Step 1: Write metrics and review-scheduling tests**

Test first-attempt pass rate, median completion time, mastery by topic, due-review ordering, no duplicate consecutive topic when alternatives exist, and one timed interview session per seven completed plans.

- [ ] **Step 2: Implement library, mistake queue, and progress views**

Library filters by kind, difficulty, status, topic, and weak topic. Mistakes show failed evidence, accepted solution, mistake notes, and next-review date. Progress shows seven-day completion, first-pass rate, median time, topic mastery, and latest validated Agent recommendations; unavailable Agent review renders `深度复盘处理中` without blocking progress.

- [ ] **Step 3: Write full e2e acceptance flows**

Cover: Junaspark allowed/other denied; 09:30 new plan; incomplete plan reused next morning; 20:00 reminder; complete one item and carry only the other; desktop and mobile edit/run/submit; refresh and cross-device draft recovery; Worker timeout followed by recovery; both complete enqueue Git export; changed remote SHA pauses sync; mock Agent review displays; all 19 migrated exercises searchable.

- [ ] **Step 4: Add CI and deployment documentation**

CI runs `pnpm install --frozen-lockfile`, lint, typecheck, unit/integration tests, build, and Playwright. Deployment docs list PostgreSQL setup, GitHub OAuth callback URL, all required environment key names, UTC cron expressions, PWA HTTPS requirement, Codex bridge setup, initial seed, rollback, Git sync replay, and credential rotation. Do not prescribe a hosting vendor; record the chosen provider during execution.

- [ ] **Step 5: Verify migration before removing static runtime**

Run a comparison script that asserts exactly 19 matching legacy IDs and byte-for-byte equality for normalized code, status, complexity, mistakes, and questions. Only after it passes, remove `app.js`, `index.html`, `styles.css`, `downloads/handbook-standalone.html`, and obsolete Pages workflow/publish scripts; retain a generated handbook export only if README still links it.

- [ ] **Step 6: Run the completion audit**

```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
pnpm build
pnpm playwright test
git status --short
```

Expected: every command exits 0; Playwright covers desktop and mobile; working tree contains only intentional documentation updates.

- [ ] **Step 7: Commit**

```bash
git add app domain tests .github README.md docs scripts
git commit -m "feat: complete personal algorithm training platform"
```

---

## Final Operational Gate

Before enabling real schedules or direct-to-main writes:

1. Run the morning and evening handlers manually against a staging database.
2. Use a disposable branch to verify the exact Git export tree, then switch configuration to `main` only after review.
3. Authenticate once as `Junaspark` and once with a separate GitHub account to prove denial.
4. Install the PWA on one phone and complete both exercise types using touch only.
5. Run with `AGENT_ADAPTER=mock`, then enable the Codex bridge and compare both results against `agent-job.v1`.
6. Create an incomplete plan, advance the clock across 09:30 and 20:00, and prove no new plan appears.

## Task 9 migration and exercise hardening report (2026-07-17)

- Replaced every `function-presence` assertion with a closed, schema-validated authored scenario; learner input cannot provide executable test code.
- Added real Worker readiness coverage for all 19 canonical exercises: each migrated starter passes and a deliberately wrong implementation fails.
- Rebuilt migration as destination-parameterized library functions. Staging is schema/readiness validated before an atomic swap, with restoration and cleanup for absent destinations, stale backups, and failures before or after the swap.
- The comparator verifies schema validity, unique canonical IDs, exact stable slug mapping, and normalized deep equality of code, status, complexity, mistakes, and questions.
- Verification evidence: 169 Vitest tests, TypeScript, ESLint, migration comparison, production build (with build-time test environment), and the three real-browser Worker tests passed.
