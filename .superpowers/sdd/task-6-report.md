# Task 6 Report — Responsive Practice Workspace

## Outcome

Implemented the authenticated daily practice workspace with a 42/58 desktop workbench, accessible mobile tabs and sticky actions, client-only Monaco, Task 5 worker execution, versioned drafts, IndexedDB retry queue, structurally validated full-run submissions, atomic plan completion/job creation, and a network-safe PWA shell.

The visual direction is an editorial coding notebook: warm paper surfaces, dark ink editor, restrained green completion accents, serif problem typography, ruled-paper detail, and explicit focus rings. No purple-gradient/dashboard treatment or external imagery is used.

## RED / GREEN

- **RED:** `pnpm vitest run tests/components/PracticeWorkspace.test.tsx tests/api/drafts.test.ts tests/api/submissions.test.ts` failed because all three modules/routes were absent.
- **GREEN:** the same focused command passes: 3 files, 9 tests.
- Tests cover simultaneous desktop regions, mobile tab semantics, 2-second save debounce, conflict recovery, public Run output, full-run Submit, authenticated ownership, Zod rejection, and HTTP 409 version details.
- **Browser RED:** `pnpm exec playwright test tests/e2e/mobile-practice.spec.ts` could not load either viewport because the standalone Vite harness could not resolve the production workspace's `@/workers/runner-client` import. TypeScript, Next, and Vitest already mapped `@/*`; Vite did not.
- **Browser GREEN:** added the matching repository-root alias in `vite.config.ts`; the same Playwright command passes 2/2 tests in Chromium (desktop 1440×900: 528ms; mobile 390×844: 248ms). Both viewports render the production `PracticeWorkspace`, use the Task 5 runner client with an injected Worker boundary, run public tests, submit full-test evidence, and show acceptance; mobile also verifies the Code and Results tab transitions.

## Security and correctness notes

- Draft and submission user IDs come only from Auth.js sessions; request bodies cannot choose owners.
- Draft writes use optimistic versions and return `DRAFT_CONFLICT` with local/server versions.
- Submitted code never runs on the server. The route accepts only all-passing `scope: full` evidence, then production persistence compares the exact authored full-test count/order/names before updating progress.
- The transaction locks the active plan, persists the passing submission, completes its item, and only when both items are complete creates the Git and Agent jobs. A unique plan index makes Git job insertion idempotent.
- IndexedDB keys are `${userId}:${exerciseId}` and values contain only code/version/exercise ID—no tokens or session secrets.
- The service worker never intercepts `/api/*` or non-GET requests. It caches only the public shell, manifest, Next static assets, and static exercise metadata.
- Monaco is a client-only dynamic import, keeping it out of server rendering and avoiding hydration coupling.

## Verification

| Check | Result |
|---|---|
| Focused component/API | PASS — 3 files, 9 tests |
| Full Vitest | PASS — 19 files, 75 tests |
| TypeScript | PASS — `pnpm exec tsc --noEmit` |
| ESLint | PASS — `pnpm lint` |
| Production build | PASS — `next build` with schema-valid placeholder env; 11 routes generated |
| Diff whitespace | PASS — `git diff --check` |
| Playwright desktop + 390×844 | PASS — 2 Chromium tests; desktop 528ms, mobile 248ms |

## Visual check

The desktop and mobile flows were exercised in real headless Chromium at 1440×900 and 390×844. The test asserts the production workspace regions, mobile tabs, public run result, full submission acceptance, and automatic mobile Results selection. It runs with:

```bash
pnpm playwright test tests/e2e/mobile-practice.spec.ts
```

## Files of note

- `components/practice/PracticeWorkspace.tsx`
- `components/practice/CodeEditor.tsx`
- `app/api/drafts/route.ts`
- `app/api/submissions/route.ts`
- `domain/submissions/service.ts`
- `public/sw.js`
- `tests/e2e/mobile-practice.spec.ts`

## Review fixes (2026-07-16)

- Added immutable draft operation IDs and compare-and-delete semantics. A flush deletes only the exact stored operation it sent; 409 results remain queued.
- Draft sending now returns saved/conflict/retry details. “保留本地代码” rebases the unchanged local code against `serverVersion`, retries explicitly, and removes the queued conflict only after success.
- Added a deterministic Vite route adapter instead of replacing every fetch. The browser harness now uses the actual Task 5 module Worker, real IndexedDB/offline transitions, real 409 route responses, and browser keyboard code edits. The adapter is deliberately scoped to authenticated draft/submission contract behavior; production Auth.js and PostgreSQL remain covered by API/PGlite tests.
- Added submission request idempotency and Agent job uniqueness (`submission_id`), with conflict-safe inserts. PGlite covers exact authored suite matching, active-plan ownership, both-item completion, replay idempotency, and exactly one Git/Agent job.
- Added Monaco format-on-demand via `editor.action.formatDocument`.
- Completed WAI-ARIA tabs with IDs, `aria-controls`/`aria-labelledby`, tabpanels, roving tab index, and Arrow/Home/End navigation.

### Exact verification

- PASS: `pnpm vitest run tests/components tests/api tests/db/repositories.integration.test.ts` — 7 files, 28 tests.
- PASS: `pnpm vitest run` — 21 files, 80 tests.
- PASS: `pnpm lint`.
- PASS: `pnpm exec tsc --noEmit`.
- PASS: `git diff --check`.
- PASS: `pnpm playwright test e2e/runner-browser.spec.ts --reporter=line` — 3/3 actual Task 5 Worker tests.
- PARTIAL/FAIL: `pnpm playwright test tests/e2e/mobile-practice.spec.ts --reporter=line`. Real Worker execution, submission route behavior, browser code editing, offline IndexedDB enqueue/online flush, and real 409 display execute. The final recovery activation is not observed by the deterministic route because `@monaco-editor/react` attempts to load its language worker from blocked jsDelivr, producing a Vite error overlay; the component recovery test passes and verifies the retry body uses the returned server version. This browser-harness concern remains unresolved and is not reported as passing.

## Local Monaco/browser gate completion (2026-07-16)

- Added `monaco-editor@0.55.1` as an explicit runtime dependency and configured `@monaco-editor/react` with the locally bundled Monaco API.
- Added repository-local editor and TypeScript worker entry modules. `MonacoEnvironment.getWorker` uses standard `new Worker(new URL(..., import.meta.url))`, which is verified by both the Vite browser harness and the Next.js 16 Turbopack production build.
- Explicitly registered the JavaScript/TypeScript contribution and warmed the JavaScript language worker when the editor mounts. The browser gate waits for worker readiness before entering real offline mode and fails on Monaco's worker-fallback warning.
- The browser harness now explicitly declares Vite instead of relying on a transitive binary.
- Prevented successful draft version updates from resaving unchanged code, and made IndexedDB queue flushing single-flight so duplicate browser `online` events cannot send the same optimistic-version operation concurrently and leave a stale conflict.
- The strict browser gate aborts jsDelivr and unpkg, performs real Monaco keyboard edits, runs and submits through the real Task 5 Worker, verifies IndexedDB offline enqueue and online flush, observes a real HTTP 409, activates “保留本地代码” by mouse on desktop and Enter on mobile, and confirms `{ version: 10, code: "...6 * 7..." }`.

### Final exact verification

- PASS: `CI=true pnpm playwright test e2e/runner-browser.spec.ts --reporter=line` — 3/3 real Task 5 module Worker tests.
- PASS: `CI=true pnpm playwright test tests/e2e/mobile-practice.spec.ts --reporter=line` — 2/2 Chromium tests at 1440×900 and 390×844; local Monaco worker ready, no jsDelivr/unpkg requests, no worker fallback, real offline/online/409 recovery, final version 10 containing `6 * 7`.
- PASS: `CI=true pnpm vitest run tests/components tests/api tests/db/repositories.integration.test.ts --reporter=default` — 7 files, 29 tests.
- PASS: `CI=true pnpm vitest run --reporter=default` — 21 files, 81 tests.
- PASS: `CI=true pnpm exec tsc --noEmit`.
- PASS: `CI=true pnpm lint`.
- PASS: `CI=true AUTH_SECRET=test-secret AUTH_GITHUB_ID=test-client AUTH_GITHUB_SECRET=test-client-secret DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/fe_algorithm_gym OWNER_USER_ID=test-owner CRON_SECRET=test-cron pnpm build` — Next.js 16.2.10 Turbopack compiled, typechecked, and generated 11/11 static pages.
- PASS: `git diff --check`.
- Existing non-failing tool warning: `packageManager` is declared as floating `pnpm@10`, so the managed runtime warns that it is not an exact version.

## Final idempotency and migration review fix (2026-07-16)

- Rechecks the exact owner/exercise/request tuple after an active-plan lock miss, so a concurrent retry of the final item returns the winner's submission instead of `ACTIVE_PLAN_NOT_FOUND`. The lookup remains scoped to the authenticated user and cannot replay another user's result.
- Added a deterministic PGlite `Promise.all` regression that forces the loser's initial lookup to observe the stale miss from the PostgreSQL race, while all subsequent reads/writes use the real database. It asserts equal responses and exactly one submission, Git job, and Agent job.
- Replaced the unjournaled hand-written association migration with a Drizzle-generated migration and snapshot. The old application did not consume Agent jobs and deployed databases are expected to contain none; as an explicit safe upgrade policy, any unassociated legacy Agent jobs are discarded before adding required `plan_id` and `submission_id` columns. This avoids fabricating ownership and lets both fresh and legacy PGlite databases enforce the runtime `NOT NULL` schema.
- The required workspace browser gate exposed a repeatable Monaco startup race on desktop (`JavaScript not registered!`). The editor now retries the local JavaScript worker warm-up for up to two seconds; the gate subsequently passes at both desktop and mobile sizes without CDN access or worker fallback.

### Exact final verification

- PASS: `CI=true ./node_modules/.bin/vitest run --reporter=default` — 21 files, 83 tests.
- PASS: `CI=true ./node_modules/.bin/vitest run tests/db/repositories.integration.test.ts --reporter=default` — 1 file, 9 tests, including concurrent final-submit and legacy migration upgrade coverage.
- PASS: `CI=true ./node_modules/.bin/eslint .`.
- PASS: `CI=true ./node_modules/.bin/tsc --noEmit`.
- PASS: `CI=true AUTH_SECRET=test-secret AUTH_GITHUB_ID=test-client AUTH_GITHUB_SECRET=test-client-secret DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/fe_algorithm_gym OWNER_USER_ID=test-owner CRON_SECRET=test-cron ./node_modules/.bin/next build` — compiled, typechecked, and generated 11/11 static pages.
- PASS: `CI=true ./node_modules/.bin/playwright test tests/e2e/mobile-practice.spec.ts --reporter=line` — 2/2 Chromium workspace tests.
- PASS: `CI=true ./node_modules/.bin/playwright test e2e/runner-browser.spec.ts --reporter=line` — 3/3 real Task 5 Worker tests.
- PASS: `git diff --check`.
