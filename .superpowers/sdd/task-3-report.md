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

- `pnpm lint` cannot run until the repository adds an ESLint flat config compatible with its installed ESLint 10.
- `/unauthorized` is intentionally the required redirect target, but the brief did not request an unauthorized page, so it currently resolves through the app's not-found UI.
