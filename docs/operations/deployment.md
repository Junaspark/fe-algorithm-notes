# Deployment runbook

This application is provider-neutral. Record the selected application, PostgreSQL, scheduler, and secret-manager providers in the deployment change ticket; this repository does not require a hosting vendor.

## Required environment

Set server-only secrets in the chosen secret manager: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` (initially a disposable validation branch, then `main`), `CRON_SECRET`, `AGENT_ADAPTER`, `AGENT_BRIDGE_SECRET`, and `CODEX_BRIDGE_URL`. Set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin. Never expose the token or bridge secrets through a `NEXT_PUBLIC_` name.

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

## PWA and Agent bridge

Serve every route and worker over HTTPS. Install the PWA on a phone and complete both an algorithm and frontend exercise using touch only. Configure the Codex bridge per `docs/agent/codex-bridge.md`; validate `AGENT_ADAPTER=mock` first, then the bridge, with both producing schema-valid `agent-job.v1` results. Agent downtime must display `深度复盘处理中` without blocking progress.

## Git live gate

Use a disposable branch to inspect the exact export tree. Confirm only `exercises/`, `solutions/`, and `reports/` change, then set `GITHUB_BRANCH=main`. A remote SHA change must pause the job rather than overwrite it. No real schedule or direct-to-main write is enabled by CI.
