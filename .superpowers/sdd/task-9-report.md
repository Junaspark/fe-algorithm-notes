# Task 9 report

## Delivered

- Added server-rendered editorial workbench views for the 19-item library, mistake evidence/review queue, and seven-day progress with validated Agent recommendations and non-blocking fallback.
- Added exact progress metrics and deterministic review scheduling, including the one-in-seven timed interview cadence.
- Persisted completion duration with an additive PostgreSQL migration.
- Added safe `function`, `function-presence`, and bounded `console-output` browser-worker evaluation contracts. Event Loop questions no longer use fake `args: [] / expected: null` assertions; applicable legacy functions have curated executable cases.
- Made legacy migration writes staging-directory atomic and added an executable comparison gate for exactly 19 IDs plus normalized code, status, complexity, mistakes, and questions.
- Added Playwright acceptance coverage for allow/deny auth, morning carryover/evening remnant, all-19 browser search, Worker timeout recovery, and retained desktop/mobile draft/run/submit/conflict flows. Existing integration suites cover Git enqueue/SHA conflict and mock Agent validation.
- Replaced Pages deployment with provider-neutral CI and deployment/recovery runbooks covering live PostgreSQL gates, OAuth, exact environment names, UTC cron, HTTPS PWA, Codex bridge, seed, rollback, queue replay, and credential rotation.
- Added short-lived HMAC execution attestations with transactionally single-use database nonces. Completion and Git/Agent enqueue no longer trust unsigned caller-supplied test statuses.
- Defined deterministic Codex Automation delivery commands; the app does not claim to be a Push/email provider. Added a disposable Git promotion branch setting with `main` as the production default.
- Split normal production and E2E-only builds, and protected mutable E2E state with compile/runtime gates, localhost restriction, and a high-entropy header.
- Removed obsolete static application, handbook export, Pages workflow, and publish scripts after the migration comparison passed. `styles.css` remains because it is the active Next.js global stylesheet, not an unused legacy runtime asset.
- Surfaced Monaco worker warm-up failure explicitly and corrected Task 7 evidence counts.

## Verification evidence

- Migration comparison: passed, 19 exact IDs and preserved fields.
- Vitest: 32 files, 172 tests passed (focused hardening suite: 7 files, 44 tests).
- Playwright: 6 real-Next acceptance tests passed, including desktop and mobile.
- TypeScript: passed.
- ESLint: passed (the one unused-import warning found during iteration was removed).
- Next production build: passed with inert build-only environment placeholders; no external connection or write occurred.

## Operational gates not executed

No real PostgreSQL, OAuth account, Codex Automation delivery, phone installation, Codex bridge, GitHub token, disposable-branch promotion, direct-to-main write, or hosting deploy was used. Browser acceptance uses real Next UI/Route Handlers with a dual-gated deterministic repository; PGlite exercises production Drizzle transactions, and Git/Agent adapters use injected fakes. The staging and production gates are documented in `docs/operations/deployment.md` and `docs/operations/recovery.md`.
