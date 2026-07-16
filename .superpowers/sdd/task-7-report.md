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
