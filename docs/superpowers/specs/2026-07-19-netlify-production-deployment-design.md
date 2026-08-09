# Netlify Production Deployment Design

## Goal

Turn the completed personal frontend algorithm gym into a production service that the single owner, GitHub account `Junaspark`, can use from desktop and mobile. The production service must preserve the approved daily-plan, carry-over, coding, Agent, and direct-to-GitHub behaviors without introducing an application-side OpenAI API key.

## Selected platform

Deploy the existing Next.js application to the Netlify site `fe-algorithm-gym` at `https://fe-algorithm-gym.netlify.app`. Use Netlify Database for managed PostgreSQL. The current Free account includes 300 monthly credits, has no payment method, and has automatic top-up disabled; exhausting credits may suspend service but cannot automatically charge the owner.

The application remains provider-neutral. Netlify-specific code is limited to connection-string discovery, migration packaging, and deployment configuration. Domain services, repositories, Auth.js, Git sync, and Agent adapters retain their existing interfaces.

## Database adapter and migrations

Keep the existing `postgres` driver and Drizzle repositories. Resolve the production connection string in this order:

1. `DATABASE_URL`, for local, CI, and non-Netlify deployments.
2. `NETLIFY_DB_URL`, for Netlify Database runtime and build tasks.

Fail closed when neither exists. Add `@netlify/database` only if Netlify requires it for automatic database provisioning; production queries continue through the existing driver.

Expose the existing ordered SQL migrations through `netlify/database/migrations` without duplicating schema ownership. Netlify deployment applies them before the application is promoted. Seed exactly 19 exercises after migration and verify schema, stable IDs/slugs, and behavior readiness. A live connection gate must exercise two independent connections and the production transaction/retry paths before promotion.

## Authentication and secrets

Create a GitHub OAuth application with:

- Homepage: `https://fe-algorithm-gym.netlify.app`
- Callback: `https://fe-algorithm-gym.netlify.app/api/auth/callback/github`

Store all secrets only in Netlify environment variables. Production requires `AUTH_SECRET`, GitHub client credentials, database configuration, `CRON_SECRET`, execution-receipt secret, Git sync credentials, Agent adapter configuration, owner ID, and `NEXT_PUBLIC_APP_URL`. Authentication must accept normalized login `Junaspark` and reject a second GitHub account.

The E2E-only login and state routes remain unavailable in the normal production artifact.

## Deployment and promotion

1. Keep PR #1 as the deployment source while CI is repaired.
2. Produce a Netlify deploy preview from the feature branch.
3. Apply migrations and seed 19 exercises against Netlify Database.
4. Verify GitHub OAuth allowlisting, desktop/mobile PWA use, full Worker execution, draft recovery, submission, Agent fallback, and deterministic cron responses.
5. Configure Git export against `validation/promotion`; inspect that only `exercises/`, `solutions/`, and `reports/` change and that remote SHA conflicts pause instead of overwrite.
6. Obtain owner approval before merging PR #1. After merge, deploy the same verified configuration to production and switch Git sync to `main`.

Deployment is not complete merely because a public URL exists. All gates above must pass or the site remains a preview.

## Codex Automations and notification delivery

Codex task notifications remain the only reminder delivery surface. Replace the existing `每日前端题` automation with the 09:30 morning workflow rather than creating a duplicate. Create one 20:00 evening workflow.

Each automation invokes the corresponding authenticated production endpoint and publishes `delivery.message` only when non-null. The deterministic delivery ID permits retry deduplication. If the active plan is incomplete, both schedules return the same plan and remaining exercises; the morning workflow must not create a new plan. Enable Codex notifications on signed-in desktop and mobile clients and visibly verify both schedules in staging.

## Agent and Git boundaries

Use `AGENT_ADAPTER=mock` for the first deploy. Promote to the Codex bridge only after schema-valid `agent-job.v1` callbacks are observed. The application never requires an OpenAI API key. Agent downtime displays the pending-review state and never blocks exercise completion.

Git synchronization uses a server-side GitHub token with repository-only scope. It never force-pushes and never writes outside the approved three directories. The trusted-owner execution receipt remains an integrity/replay mechanism, not independent proof of browser execution.

## Error handling and rollback

- Database unavailable or credit-exhausted: requests fail without creating partial plans, submissions, or jobs; drafts remain in the browser queue.
- OAuth misconfiguration: keep the deploy in preview and do not enable automations.
- Agent unavailable: retain queued/retryable review status.
- Git SHA conflict: retain retryable job state; never overwrite remote changes.
- Failed production promotion: roll back the Netlify deploy while retaining the database and prior Git branch.

## Verification

Before production promotion, require:

- Unit/integration suite, TypeScript, ESLint, migration comparison, normal production build, isolated E2E build, and real Next Playwright acceptance.
- GitHub Actions green on PR #1.
- Live Netlify Database migration, seed count 19, and two-connection concurrency checks.
- GitHub OAuth success for `Junaspark` and denial for another account.
- Desktop and mobile coding, running, submission, refresh recovery, and PWA installation over HTTPS.
- Manual morning/evening endpoint invocations proving incomplete carry-over.
- Visible Codex task notifications on desktop and mobile.
- Validation-branch Git export inspection before switching to `main`.

