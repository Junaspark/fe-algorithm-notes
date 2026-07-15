# Task 3 report: GitHub OAuth single-user gate

## RED

Command:

```sh
pnpm vitest run tests/auth/authorize-github-user.test.ts tests/auth/protected-layout.test.tsx
```

Observed: exit 1. Both suites failed during import because `@/domain/auth/authorize-github-user` and `@/app/(protected)/layout` did not exist. This was the expected missing-feature failure.

## GREEN

Command:

```sh
pnpm vitest run tests/auth
```

Observed: exit 0; 2 test files passed, 5 tests passed.

Full verification:

```sh
pnpm vitest run
```

Observed: exit 0; 7 test files passed, 19 tests passed.

```sh
AUTH_SECRET=test-secret AUTH_GITHUB_ID=test-id AUTH_GITHUB_SECRET=test-secret DATABASE_URL=postgres://postgres:postgres@localhost:5432/test pnpm build
```

Observed: exit 0; Next.js production compilation, TypeScript, static generation, and route generation completed successfully.

```sh
pnpm lint
```

Observed: exit 2 before linting because the repository has no ESLint 9+ flat configuration (`eslint.config.js`). This is a pre-existing repository/tooling concern; no task file triggered a lint diagnostic.

## Implementation and self-review

- Authorization uses only normalized `profile.login`; display name and email are accepted by the pure function type solely to prove they cannot authorize.
- The GitHub provider persists normalized `githubLogin` on the adapter user. Auth callbacks expose explicit JWT/session properties, and the protected layout independently re-validates the session handle.
- Missing sessions redirect to `/login`; absent, tampered, or mismatched session handles redirect to `/unauthorized`.
- Zod validates all four required environment variables, while `.env.example` contains key names only.
- Database sessions use explicit Drizzle Auth.js tables and migration `0001_damp_william_stryker.sql`.
- Auth.js configuration compiles against installed `next-auth@5.0.0-beta.31` and `@auth/drizzle-adapter@1.11.2`.

## Commit

Implementation commit: `855f94e` (`feat: restrict access to Junaspark GitHub login`).

## Concerns

- Resolved in the review follow-up below: the repository now has a compatible flat config and an explicit `/unauthorized` page.

## Review follow-up: callback and denial hardening

### RED

```sh
pnpm vitest run tests/auth/auth-config.test.ts tests/auth/unauthorized-page.test.tsx
```

Observed: exit 1. `auth-config.test.ts` failed all 7 cases because `mapGitHubProfile`, `authorizeGitHubSignIn`, and `populateDatabaseSession` were not exported; `unauthorized-page.test.tsx` failed because the page module did not exist.

The first GREEN attempt exposed a provider-integration defect: 7/8 tests passed, but invoking `authConfig.providers[0].profile` returned the built-in GitHub mapping without `githubLogin`. The installed provider retains custom options separately, so the final configuration explicitly assigns the tested mapper to the configured provider object's runtime `profile` property.

### GREEN and covering verification

```sh
pnpm vitest run tests/auth/auth-config.test.ts tests/auth/unauthorized-page.test.tsx
```

Observed: exit 0; 2 files passed, 8 tests passed. These tests cover the actual configured provider mapper, raw-login-only sign-in callback, normalized adapter-user/database-session propagation, denial of missing/malformed/tampered persisted handles, and explicit unauthorized UI.

```sh
pnpm lint && pnpm exec tsc --noEmit && pnpm vitest run && AUTH_SECRET=test-secret AUTH_GITHUB_ID=test-id AUTH_GITHUB_SECRET=test-secret DATABASE_URL=postgres://postgres:postgres@localhost:5432/test pnpm build && git diff --check
```

Observed: exit 0. ESLint completed with no diagnostics; TypeScript completed with no diagnostics; Vitest passed 9 files and 27 tests; Next.js compiled, type-checked, generated 5/5 static pages, and listed `/unauthorized`; `git diff --check` completed with no whitespace errors.

### Review self-check

- `authConfig.callbacks.signIn` is the exported `authorizeGitHubSignIn` function and reads only raw `profile.login`; display name and email cannot authorize.
- The configured GitHub provider's exported `profile` mapper writes normalized `githubLogin` to the adapter user.
- The database-session callback accepts only a persisted handle that independently passes the exact allowlist gate; missing and tampered values throw before a session is exposed.
- The protected layout still independently checks the session property, preserving defense in depth.
- `/unauthorized` now renders an explicit denial instead of falling through to not-found.

### Follow-up concern

- ESLint 10.7 is incompatible with `eslint-plugin-react` 7.37's legacy rule-context API. The flat config retains Next, hooks, accessibility, and TypeScript coverage but filters `react/*` rules until that installed plugin gains ESLint 10 compatibility. It also permits the repository's existing CommonJS fixture import only under `tests/**`.
