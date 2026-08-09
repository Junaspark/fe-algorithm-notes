# Recovery runbook

## Application and database rollback

Stop schedulers first. Roll back the application to the previously recorded artifact without reversing a database migration blindly. Restore PostgreSQL from the latest verified backup or point-in-time recovery target only after exporting the affected rows for audit. Reapply the committed migration set after recovery and verify the canonical exercise count remains 19.

## Queue replay

Agent and Git sync jobs are durable and leased. Clear only expired leases; never edit a live lease token. Replay queued Git jobs with `pnpm exec tsx scripts/process-git-sync.ts` after checking `expected_head_sha` against the remote head. A mismatch stays paused for manual reconciliation. Re-submit Agent callbacks only with the same job ID and idempotency key.

For draft conflicts, preserve both server and local code, then use the explicit “保留本地代码” rebase action. Do not delete the IndexedDB queue until the server acknowledges the new version.

## Credential rotation

Rotate `AUTH_GITHUB_SECRET`, `AUTH_SECRET`, `GITHUB_TOKEN`, `CRON_SECRET`, and `AGENT_BRIDGE_SECRET` independently. Deploy consumers with overlapping old/new verification where supported, update the producer, validate one request, then revoke the old credential. Rotating `AUTH_SECRET` invalidates sessions; schedule a new Junaspark login test. Audit logs and exported Agent envelopes must contain no credential values.

## Post-recovery proof

Run lint, typecheck, all tests, build, Playwright, and `pnpm migration:compare` when the legacy source is available in the recovery checkout. Manually prove OAuth allow/deny, morning carryover, evening reminder, worker timeout recovery, mock Agent fallback, Git SHA conflict, and all 19 searchable exercises before re-enabling schedules.
