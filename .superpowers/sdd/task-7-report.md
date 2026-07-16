# Task 7 report: provider-neutral Agent jobs and Codex bridge

## Delivered

- Added strict, versioned `agent-job.v1` job/result contracts with discriminated payloads, sanitized contexts, attempt/deadline/idempotency fields, adapter/model/prompt metadata, unknown-field rejection, and a 64 KiB serialized limit.
- Added the provider-neutral `AgentAdapter` port, repository-backed orchestrator, deterministic fallback, in-memory test repository, deterministic mock adapter, and asynchronous Codex bridge/Drizzle repository.
- Preserved Task 6's required `planId`/`submissionId` columns and unique submission job. Final submissions now create a complete review-job envelope without creating a second job.
- Added authenticated pending-job fetch and HMAC-SHA256 result callback boundaries. Callback validation covers signature, schema, job ID, job type, idempotency key, deadline, size, and idempotent storage.
- Kept Agent output advisory: result schemas contain no mastery mutation or Git export command surface.
- Documented the exact Codex fetch/result/retry/stop protocol and its separation from product reminder notifications.

## TDD evidence

- Initial `tests/agents` run failed because the Agent modules/routes did not exist.
- Focused GREEN: 4 files, 12 tests passed.
- Contract coverage includes the real mock adapter, duplicate dispatch, schema-valid deterministic results, invalid/unknown fields, metadata, timeout/retry/max-attempt fallback, authenticated fetch, callback auth, callback expiry, and callback idempotency.

## Verification

- `./node_modules/.bin/tsc --noEmit` — passed.
- `AGENT_ADAPTER=mock ./node_modules/.bin/vitest run tests/agents tests/api tests/components` — 10 files, 34 tests passed.
- `./node_modules/.bin/vitest run` — 25 files, 95 tests passed.
- `./node_modules/.bin/eslint .` — passed.
- `DATABASE_URL=postgres://user:pass@127.0.0.1:5432/fe_algorithm_gym AUTH_SECRET=build-secret AUTH_GITHUB_ID=build-id AUTH_GITHUB_SECRET=build-secret CRON_SECRET=build-cron AGENT_ADAPTER=mock ./node_modules/.bin/next build` — passed; both Agent routes were emitted as dynamic routes.
- `git diff --check` — passed.

The repository package manager wrapper attempted an online dependency refresh and failed in the restricted environment, so verification used the already-installed project binaries in `node_modules/.bin`.

## Review fixes

- Evolved `agent_jobs` so `review-submission` retains exactly-one-job-per-submission while `select-exercises` uses a nullable submission association and owner-scoped idempotency. Migration `0004_agent_job_leases.sql` backfills envelope columns, removes invalid/duplicate legacy rows deterministically, and adds the partial review and owner/idempotency indexes.
- Submission completion now constructs and validates the complete `AgentJobSchema` envelope before insertion. Code over 48 KiB is rejected at the API boundary with `413 SUBMISSION_TOO_LARGE`, so no oversized submission or poisoned Agent row is persisted.
- Repository persistence rejects immutable same-ID mismatches while treating durable `attempt` as mutable. Orchestrator decisions use the stored envelope and all terminal/retry transitions use expected status plus attempt CAS semantics; stale fallback work returns the durable callback winner.
- Replaced pending-list behavior with atomic claims carrying `workerId`, `leaseToken`, `leaseUntil`, and durable `attempt`. Live leases are skipped, expired leases are requeued by claiming, and invalid legacy payloads are quarantined individually.
- Callback bodies are now strict signed envelopes binding the lease token and attempt to the result. Current lease ownership is verified transactionally. Canonically identical terminal replays return `202`; different terminal results return `409` without overwriting the winner.
- Updated the scheduled-task documentation with the exact claim, lease, HMAC callback, retry, replay, conflict, and stop protocol.

## Review-fix TDD and verification

- Confirmed new tests failed first for missing claim/complete APIs, immutable mismatch acceptance, oversized submission acceptance, stale claims, and terminal conflicts.
- Production PGlite coverage now exercises both job types, migration nullability, atomic competing workers, expired lease reclamation, and invalid-row quarantine.
- Focused Agent/API/DB/submission verification: 10 files, 46 tests passed.
- Full Vitest verification: 25 files, 101 tests passed.
- TypeScript, ESLint, production Next build, and `git diff --check` passed.

## Final review fixes

- Completion now validates the current lease expiry against an authoritative server timestamp inside the same locked transaction as status, attempt, and token checks. A matching callback after lease expiry is rejected even before job deadline and without another worker reclaiming it.
- Already-terminal callbacks retain result-based idempotency: an identical validated result replays with `202` after lease expiry, while a divergent result remains `409`.
- Replaced Node-only `Buffer.byteLength` contract sizing with a shared `TextEncoder` UTF-8 helper. Submission validation now counts bytes, probes a complete review envelope, and returns `413 SUBMISSION_TOO_LARGE` for multibyte/emoji overflow before persistence.
- Added API and production PGlite regressions for expired leases plus an approximately 20,000-emoji submission boundary case.
