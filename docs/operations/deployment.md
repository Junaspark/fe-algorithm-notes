# Deployment runbook

This application is provider-neutral. Record the selected application, PostgreSQL, scheduler, and secret-manager providers in the deployment change ticket; this repository does not require a hosting vendor.

For the selected Netlify production site, use the executable provider-specific checklist in [`docs/operations/netlify-production.md`](./netlify-production.md). It fixes the site ID, OAuth URLs, migration/seed gates, preview promotion, Codex Automation evidence, validation-branch Git sync, and rollback procedure while this document remains the provider-neutral baseline.

## Required environment

Set server-only secrets in the chosen secret manager: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `GITHUB_SYNC_TOKEN`, `GITHUB_REPOSITORY_OWNER`, `GITHUB_REPOSITORY_NAME`, `GITHUB_SYNC_BRANCH` (initially a disposable validation branch, then `main`), `CRON_SECRET`, `EXECUTION_ATTESTATION_SECRET` (at least 32 random bytes), `AGENT_ADAPTER`, `AGENT_BRIDGE_SECRET`, and `CODEX_BRIDGE_URL`. Set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin. Never expose tokens or bridge/attestation secrets through a `NEXT_PUBLIC_` name.

Create the GitHub OAuth application with callback URL `<NEXT_PUBLIC_APP_URL>/api/auth/callback/github`. Confirm the authenticated profile login is `Junaspark`; a second account must reach `/unauthorized`.

## Database and seed gate

Provision PostgreSQL with TLS, backups, point-in-time recovery, and a least-privilege application role. Against staging first:

```bash
pnpm db:migrate
pnpm seed
```

The seed must report 19 exercises. Run repository concurrency integration tests against two independent live PostgreSQL connections before production promotion; the in-process PGlite suite is not a substitute for this gate.

## Schedules

The scheduler sends authenticated requests using `CRON_SECRET`. UTC expressions are:

- Morning 09:30 Asia/Shanghai: `30 1 * * *`
- Evening 20:00 Asia/Shanghai: `0 12 * * *`

Invoke both handlers manually against staging. Create an incomplete plan, cross both schedule boundaries, and confirm the same plan ID is returned and only remaining items are notified.

Configure the two Codex Automations exactly as described in `docs/cron-reminder-contract.md`. The app only returns a deterministic delivery command; Codex task notification is responsible for desktop/mobile delivery. This is a production gate, not an in-process notification service.

## PWA and Agent bridge

Serve every route and worker over HTTPS. Install the PWA on a phone and complete both an algorithm and frontend exercise using touch only. Configure the Codex bridge per `docs/agent/codex-bridge.md`; validate `AGENT_ADAPTER=mock` first, then the bridge, with both producing schema-valid `agent-job.v1` results. Agent downtime must display `深度复盘处理中` without blocking progress.

## Git live gate

Use `GITHUB_SYNC_BRANCH=validation/promotion` to inspect the exact export tree. Confirm only `exercises/`, `solutions/`, and `reports/` change, then set `GITHUB_SYNC_BRANCH=main` (the runtime default). A remote SHA change must pause the job rather than overwrite it. No real schedule or direct-to-main write is enabled by CI.

## Submission execution receipt and trust model

Untrusted solution code continues to run only in the browser Worker; that real Worker run is the functional-correctness mechanism. After the complete authored suite passes, the client requests a two-minute execution receipt bound to authenticated user, exercise/plan item, normalized code SHA-256, exercise suite version, reported passing result, and random nonce. Submission verifies the receipt integrity and consumes its persisted nonce in the same transaction that completes the item and enqueues exports. This prevents accidental payload mismatch and makes lost-response retries idempotent; it is not independent cryptographic proof that Worker execution occurred.

This direct-to-main design assumes the GitHub-allowlisted `Junaspark` session is the trusted owner. It does not defend against that owner deliberately modifying their browser or fabricating a result at the authenticated receipt boundary. Server-side execution remains intentionally forbidden. Production promotion must protect OAuth, receipt, and GitHub credentials and re-confirm the account allowlist before enabling `GITHUB_SYNC_BRANCH=main`.

## Acceptance boundaries

CI first builds the normal production artifact with E2E seams compiled out, then replaces it with a separate E2E-only artifact that is never published. The E2E state route additionally requires dual compile/runtime gates, a 32+ byte secret header, and localhost. Browser tests exercise real Next pages and Route Handlers; PGlite tests exercise production Drizzle transactions, while Git and Agent boundaries use injected fakes. Live PostgreSQL, OAuth, Codex delivery, and disposable-branch Git promotion remain explicit staging gates.
