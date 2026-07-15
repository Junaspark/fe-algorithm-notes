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

---

## Review follow-up: isolation, correlation, and clone safety

### Findings fixed

- Replaced parameter-only API blocking with a frozen restricted facade supplied as `globalThis` and `self`; it also shadows `postMessage`, `Function`, `Worker`, `SharedWorker`, `EventSource`, `BroadcastChannel`, `navigator.sendBeacon`, and the originally required network/storage APIs.
- Added typed `runner:execute` and `runner:result` envelopes. The client ignores malformed, uncorrelated, and invalid-result messages and completes only for a schema-valid envelope whose outer and inner request IDs exactly match the active request.
- Constrained args, expected values, and actual values to recursive JSON-like `JsonValue`. Runtime normalization rejects functions, symbols, non-finite numbers, cyclic/non-plain objects, and throwing proxies with clone-safe test errors.
- Catches request-side/transport `DataCloneError`; worker delivery has a final clone-safe fallback. Console capture converts functions, symbols, undefined values, and throwing proxies to bounded strings.
- Added a Vite-bundled Playwright Chromium smoke using the real module Worker plus correlation/error cases.
- Explicit limitation: this remains UX isolation. Learner JavaScript can recover the intrinsic `Function` constructor through constructor chains even though direct `Function` is shadowed. It is not a security or server trust boundary.

### Follow-up RED evidence

Command:

```text
pnpm vitest run tests/workers/runner.test.ts
```

Output: `15 tests | 8 failed`; failures reproduced root-global bypass, forged `postMessage`, acceptance of malformed/uncorrelated messages, non-cloneable result delivery, unsafe log formatting, and uncaught request-side `DataCloneError`. Exit 1.

Focused schema-hardening RED:

```text
pnpm vitest run tests/workers/runner.test.ts -t "ignores malformed"
```

Output: `1 failed | 15 skipped`; a correlated envelope containing a function-valued `actual` was incorrectly accepted. Exit 1.

### Follow-up GREEN and final verification

```text
pnpm vitest run tests/workers tests/submissions
```

Output: `Test Files 2 passed (2)`, `Tests 18 passed (18)`, exit 0.

```text
pnpm exec playwright test e2e/runner-browser.spec.ts
```

Output: `3 passed (1.8s)`, exit 0. The cases cover bundled client/real module Worker loading, `globalThis.fetch` and `self.fetch` attempts, forged learner `postMessage`, ignored uncorrelated/malformed messages, and active-request worker-error correlation.

The first browser attempt could not bind the local Vite port inside the sandbox (`listen EPERM`); the approved outside-sandbox run then identified the missing matching Chromium binary. `pnpm exec playwright install chromium` installed Playwright Chromium/FFmpeg/headless-shell successfully, after which the browser suite passed.

```text
pnpm test
```

Output: `Test Files 15 passed (15)`, `Tests 63 passed (63)`, exit 0. `e2e/**` is explicitly excluded from Vitest discovery and remains owned by Playwright. An earlier discovery run correctly exposed that missing exclusion; it also hit an unrelated equal-timestamp ordering race in one PGlite repository test. The fresh final run passed all 63 tests.

```text
pnpm lint
```

Output: ESLint exit 0.

```text
pnpm exec tsc --noEmit
```

Output: TypeScript exit 0.

```text
env AUTH_SECRET=build-placeholder AUTH_GITHUB_ID=build-placeholder AUTH_GITHUB_SECRET=build-placeholder DATABASE_URL=postgresql://user:password@127.0.0.1:5432/build pnpm build
```

Output: compiled successfully, TypeScript finished, generated static pages `7/7`, exit 0.

```text
git diff --check
```

Output: exit 0 (run after this report update and generated test-result cleanup).
