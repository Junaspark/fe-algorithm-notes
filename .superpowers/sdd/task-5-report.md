# Task 5 Report: Safe JavaScript runner and deterministic feedback

## Outcome

Implemented a real browser `Worker` client/protocol and worker execution engine. Every run owns a fresh Worker, a hard client timer, and unconditional termination on result, worker error, or timeout. The server does not evaluate learner code.

The worker invokes only the authored export name, awaits returned Promises, performs structural result comparison, serializes syntax/runtime/rejection errors, captures at most 50 console entries, and shadows `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`, and `localStorage` with blocked implementations. This is documented as client isolation for UX, not a server trust boundary.

Deterministic feedback reports pass counts, failing test names, assertion/syntax/runtime/timeout categories, exercise-authored boundary hints only, and the learner's optional complexity self-assessment. It is titled `Deterministic test feedback` and never represents itself as AI.

## TDD evidence

### RED

Command:

```text
pnpm vitest run tests/workers/runner.test.ts
```

Observed expected failure: Vitest could not resolve `@/workers/runner-client`; 1 failed suite, exit 1. No production runner files existed.

### GREEN

Command:

```text
pnpm vitest run tests/workers tests/submissions
```

Observed: 2 files passed, 9 tests passed, exit 0. Coverage includes success, assertion mismatch, syntax error, thrown error, rejected Promise, infinite-loop hard timeout, fresh-worker recovery, result termination, bounded logs, blocked network/storage identifiers, and deterministic feedback provenance/categories.

The test Worker transport uses a Node worker thread only as a deterministic browser-compatible harness. That thread imports and executes the actual `workers/runner.worker.ts` module; the infinite loop is genuinely terminated rather than mocked.

## Verification

- Focused: `pnpm vitest run tests/workers tests/submissions` — 2 files, 9 tests passed.
- Full: `pnpm test` — 15 files, 54 tests passed.
- Lint: `pnpm lint` — exit 0.
- TypeScript: `pnpm exec tsc --noEmit` — exit 0.
- Build: `env AUTH_SECRET=build-placeholder AUTH_GITHUB_ID=build-placeholder AUTH_GITHUB_SECRET=build-placeholder DATABASE_URL=postgresql://user:password@127.0.0.1:5432/build pnpm build` — compiled, type checked, generated 7/7 static pages, exit 0.
- Diff check: `git diff --check` — exit 0.

The first bare `pnpm build` compiled and type checked, then stopped during existing `/login` page-data collection because `DATABASE_URL` was absent. The verified build used non-secret, syntactically valid build placeholders required by the existing environment schema; it did not connect to the placeholder database.

## Files

- `workers/runner.protocol.ts`
- `workers/runner.worker.ts`
- `workers/runner-client.ts`
- `domain/submissions/rule-feedback.ts`
- `tests/workers/runner.test.ts`
- `tests/submissions/rule-feedback.test.ts`

## Concerns

- Worker isolation protects page responsiveness and blocks the specified ambient APIs, but it is deliberately not a security boundary. Any future authoritative acceptance must continue to treat client evidence as untrusted.
- The package declares `pnpm@10` rather than an exact pnpm version, so Corepack prints an existing warning on pnpm commands. It does not affect command exit status and is outside Task 5 scope.
