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

## Security boundaries

- GitHub OAuth allows only normalized handle `junaspark`.
- User JavaScript runs only in a browser Web Worker with a hard timeout.
- Git export is restricted to `exercises/`, `solutions/`, and `reports/`.
- Agent output is schema validated; training remains usable when the adapter is unavailable.
- Secrets are server-only and must never be committed.
