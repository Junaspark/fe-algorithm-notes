# Task 4 Report

## Scope

Implemented the Asia/Shanghai daily-plan policy, prioritized exercise selector, provider-neutral notification port/recording adapter, evening reminder policy, and authenticated morning/evening cron Route Handlers.

Concurrency is handled at both layers: the existing `daily_plans_one_active_per_user` partial unique index is the database invariant, and the morning service catches `ACTIVE_PLAN_EXISTS`, re-reads the winner, and returns it without creating another plan.

## RED

- `pnpm vitest run tests/plans tests/reminders tests/api/cron.test.ts`
  - Exit 1: all three suites failed because the new service and route modules did not exist.
- Added selector-priority test before implementing `domain/plans/selector.ts`; focused suite remained red on the missing production modules.
- Added unset-secret fail-closed test using an exact synthetic `Bearer ` header.
  - Exit 1: handler authorized it and attempted to call the service, proving the empty-secret vulnerability.

## GREEN

- Implemented plan carry-over with no selector call, exact algorithm/frontend validation, Shanghai local date generation, atomic repository creation, and active-plan conflict recovery.
- Implemented due-review -> weak-topic -> unseen selection independently for each exercise kind.
- Implemented evening notification of pending items only and no notification when no active plan exists.
- Implemented SHA-256 fixed-length digest comparison with `timingSafeEqual`, explicit empty-secret rejection, 401 responses, and single service invocation per authorized request.
- Exact schedule instants exercised with frozen clocks:
  - `2026-07-16T01:30:00Z` (09:30 Asia/Shanghai; deployment cron `30 1 * * *`)
  - `2026-07-16T12:00:00Z` (20:00 Asia/Shanghai; deployment cron `0 12 * * *`)

## Verification

- Focused: `pnpm vitest run tests/plans tests/reminders tests/api/cron.test.ts` -> exit 0, 3 files, 13 tests passed.
- TypeScript: `pnpm exec tsc --noEmit` -> exit 0.
- Lint: `pnpm lint` -> exit 0, no warnings/errors.
- Full tests: `pnpm test` -> exit 0, 12 files, 40 tests passed.
- Build: `DATABASE_URL=postgres://user:pass@127.0.0.1:5432/db AUTH_SECRET=build-secret AUTH_GITHUB_ID=build-id AUTH_GITHUB_SECRET=build-github-secret pnpm build` -> exit 0; both cron routes emitted as dynamic routes.

## Commit

This report is included in the Task commit: `feat: schedule persistent daily practice plans` (hash reported to the orchestrator after creation).

## Concerns

- The first full-suite run exposed an existing timestamp-ordering flake in `tests/db/repositories.integration.test.ts`: two submissions received the same PostgreSQL timestamp and UUID-desc tie-breaking did not match insertion order. A fresh full run passed 40/40. This Task did not alter submission ordering.
- `pnpm` emits the existing warning that `packageManager: "pnpm@10"` is not an exact version.
- The production runtime uses the recording notification adapter until a delivery provider is selected; the service boundary is provider-neutral and ready for replacement.
- A build without required application environment variables fails in pre-existing auth/database initialization. The verified build used non-secret dummy build-time values and made no database connection.

## Review Fixes

- Refactored both exported cron routes around lazy runtime factories. Bearer authentication and fail-closed `CRON_SECRET` validation now happen before runtime import, database initialization, or `OWNER_USER_ID` access.
- Replaced the production module-global recording adapter with a request-scoped, bounded `NotificationOutboxAdapter`. Authorized JSON responses expose the structured `reminder` command for the Codex scheduled-task caller to deliver through Push/email; `null` explicitly means no reminder is due.
- Added `docs/cron-reminder-contract.md` describing payload semantics, outbox bounds, authentication ordering, caller responsibility, and UTC schedules.
- Added route-factory tests proving missing/wrong bearer credentials never call either runtime factory, an environment-wiring test for `CRON_SECRET`, response payload tests, a repeated-morning no-duplicate test, bounded outbox tests, and suite-level fake-timer cleanup.

### Review RED

- `pnpm vitest run tests/plans tests/reminders tests/api/cron.test.ts` -> exit 1: missing outbox module and missing lazy route creators (1 failed suite, 8 failed route tests).

### Review GREEN and verification

- `pnpm vitest run tests/plans tests/reminders tests/api/cron.test.ts` -> exit 0, 4 files and 18 tests passed.
- `pnpm test` -> exit 0, 13 files and 45 tests passed.
- `pnpm exec tsc --noEmit` -> exit 0.
- `pnpm lint` -> exit 0, no warnings/errors.
- `DATABASE_URL=postgres://user:pass@127.0.0.1:5432/db AUTH_SECRET=build-secret AUTH_GITHUB_ID=build-id AUTH_GITHUB_SECRET=build-github-secret pnpm build` -> exit 0; both cron routes emitted as dynamic routes.
- `git diff --check` -> exit 0.
- Review-fix commit subject: `fix: make cron reminder delivery request scoped` (hash reported to the orchestrator after creation).
