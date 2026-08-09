# Task 8 review

## Verdict

Changes requested. The Git Data call sequence and export shaping are generally sound, but the replay and worker-claim logic contain integrity and liveness defects.

## Findings

### [P1] Do not identify an uncertainly-applied commit by attacker-controlled metadata

- File: `adapters/github/repository.ts:27`
- Evidence: when `knownCommitSha` is absent, `matchesKnownCommit` is always true. A process can successfully update `main` and crash before `recordCommit`; on retry, any current commit with the predictable message and `expectedHeadSha` as a parent is accepted as this job's commit without checking its tree or exported contents. A concurrent writer can therefore substitute arbitrary content and cause the job to be marked succeeded.
- Fix: never accept the replay solely from message/parent. Persist the intended commit SHA before attempting `updateRef` (the commit object already exists), then only accept exact SHA equality on replay. Alternatively recompute/verify the complete expected tree SHA, but exact persisted commit identity is simpler. Ensure a crash between commit creation, ref update, commit recording, and success transition is covered by tests.

### [P1] An exhausted oldest job prevents every later job from being claimed

- File: `scripts/process-git-sync.ts:61`
- Evidence: the query includes failed rows with `attempt <= maxAttempts`, orders oldest first, then returns `null` when that selected failed row has `attempt >= maxAttempts`. Once the oldest failed job reaches the bound, each worker repeatedly selects it and exits without considering queued or retryable jobs behind it.
- Fix: exclude terminal attempts in SQL, e.g. select `status = 'queued' OR (status = 'failed' AND attempt < maxAttempts)`, and remove the post-selection early return. Prefer a distinct terminal status if the schema permits it. Add an integration test with an exhausted oldest row followed by a queued row.

### [P1] Running jobs have no lease expiry or crash recovery

- File: `scripts/process-git-sync.ts:61`
- Evidence: `claim` only selects `queued` and `failed`; it never reclaims `running`. There is no lease timestamp/expiry column. A worker crash after claiming—or after the remote ref update but before local transitions—leaves the job permanently `running`, so retry and idempotent replay never occur.
- Fix: store a lease expiry (or claimed timestamp), atomically include expired `running` rows in the `FOR UPDATE SKIP LOCKED` claim query, rotate the lease token, and increment/retain attempts according to the documented retry policy. Add concurrent-worker and expired-lease recovery integration tests.

### [P2] Canonicalize Unicode before duplicate-path checks

- File: `domain/git/paths.ts:9`
- Evidence: slash and dot normalization are applied, but Unicode normalization is not. Canonically equivalent IDs such as NFC `é` and NFD `e\u0301` produce separate manifest paths and bypass `DUPLICATE_EXPORT_PATH`, while appearing identical and potentially colliding on normalization-sensitive checkout filesystems.
- Fix: normalize the candidate (or each segment) to NFC before POSIX normalization and return that canonical form; run duplicate detection on it. Add NFC/NFD duplicate and Unicode-preservation tests.

## Verification

- Task-specific tests: PASS — 3 files, 18 tests.
- Full suite: PASS — 28 files, 122 tests.
- TypeScript: PASS — `tsc --noEmit`.
- ESLint: PASS — `eslint .`.
- Production build: PASS — Next.js 16.2.10, 12/12 pages generated with placeholder environment values.
- Diff whitespace check: PASS — `git diff --check 2365074..06c41da`.
- The initial `pnpm` invocation attempted a dependency metadata/install check and failed because network access was unavailable; verification was rerun successfully with the already-installed project binaries.

## Confirmed strengths

- Export paths reject NUL, POSIX/Windows absolute paths, traversal, dot-prefixed roots, and paths outside the exact three roots; backslashes are canonicalized.
- The structured exercise export omits hidden tests and unrelated draft/session/Agent fields; per-file and aggregate UTF-8 content limits and duplicate checks are present.
- Octokit uses the base commit tree, blobs, a derived tree, one commit with the expected parent, and `updateRef(... force: false)`; 409/422 are classified retryable.
- The review executed no GitHub writes.

## Review fixes

- Replay integrity now derives a SHA-256 fingerprint from the exact base SHA, local date, NFC-normalized paths, and contents, embeds it in the generated commit body, deterministically recreates the intended Git objects, and accepts an uncertain update only when `main` equals that exact generated commit SHA (and the recorded SHA, when present). Predictable human messages and matching parents are never sufficient.
- Git sync jobs now carry `attempt`, `worker_id`, `lease_token`, and `lease_until`. Claims use `FOR UPDATE SKIP LOCKED`, rotate the token, reclaim expired running work with an incremented attempt, atomically exclude/mark exhausted rows `dead`, and bind record/success/failure transitions to a live token-owned lease.
- Export paths are normalized to Unicode NFC before whitelist validation, duplicate detection, and output.
- Added regressions for malicious same-message commits with different trees, NFC/NFD collisions, exhausted-oldest starvation, concurrent claims, expired-lease crash recovery, and stale/expired lease tokens.
