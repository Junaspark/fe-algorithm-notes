# FE Algorithm Gym

个人专用的 JavaScript 面试训练 PWA：每天一道算法题和一道前端手写题，支持桌面/手机编码、Web Worker 判题、跨设备草稿、错题复训、Agent 深度复盘和受限 GitHub 导出。

## Local development

Requires Node.js 22, pnpm 10, and PostgreSQL.

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm seed
pnpm dev
```

Required environment names and production gates are documented in [deployment](docs/operations/deployment.md); rollback, replay, and rotation are in [recovery](docs/operations/recovery.md). The provider-neutral Codex bridge contract is in [Codex bridge](docs/agent/codex-bridge.md).

## Verification

```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
pnpm build
pnpm playwright test
pnpm migration:compare
```

The migration gate compares exactly 19 legacy IDs and deep-compares normalized code, status, complexity, mistakes, and interview questions before obsolete static runtime files may be removed. Canonical exercises live in `exercises/*.json`; application state lives in PostgreSQL.

## Browser acceptance

`E2E_COMPILE=1 pnpm build && pnpm test:e2e` runs Playwright against `next start`, not the Vite fixture server. The suite drives protected App Router pages, Monaco and the exercise Worker, and the draft, submission, cron, Agent-review, and Git-conflict HTTP paths. Deterministic state is available only when the artifact was built with `E2E_COMPILE=1`, started with `E2E_TEST_MODE=1`, explicitly bound to `E2E_BIND_HOST=127.0.0.1`, and configured with a 32+ byte `E2E_ACCESS_SECRET`; mutable state requests also require that secret header and loopback host. Otherwise `/api/e2e/state` is a 404 and normal Auth.js/PostgreSQL/adapters remain in use. This in-memory acceptance repository verifies Next wiring and browser behavior; PostgreSQL repository behavior remains covered by the PGlite integration suite and the live-PostgreSQL promotion gate documented in `docs/operations/deployment.md`.

## Security boundaries

- GitHub OAuth allows only normalized handle `junaspark`.
- User JavaScript runs only in a browser Web Worker with a hard timeout.
- Git export is restricted to `exercises/`, `solutions/`, and `reports/`.
- Agent output is schema validated; training remains usable when the adapter is unavailable.
- Secrets are server-only and must never be committed.
