# Task 1 implementation report

## Outcome

Established the Next.js/Vitest/TypeScript application foundation, defined the canonical Zod exercise contract, migrated all 19 legacy records to stable JSON files, replaced the static Pages workflow with a Task 9 placeholder, and added the minimal App Router shell that redirects `/` to `/today`.

Implementation commit: `852362d` (`feat: establish exercise platform foundation`)

## Files changed

- Toolchain: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `vitest.config.ts`, `.gitignore`
- Application: `app/layout.tsx`, `app/page.tsx`
- Contract: `domain/exercises/schema.ts`
- Migration: `scripts/migrate-legacy-data.mjs`, 19 files under `exercises/`
- Tests: `tests/exercises/schema.test.ts`, `tests/exercises/migration.test.ts`, `tests/app/page.test.ts`, `tests/fixtures/legacy-data.js`
- CI placeholder: `.github/workflows/pages.yml`
- Verified unchanged: `data.js`, `app.js`, `index.html`, `styles.css`

## TDD evidence

### Exercise schema

- RED: `pnpm vitest run tests/exercises/schema.test.ts`
  - Failed because `@/domain/exercises/schema` did not exist.
- GREEN: same command
  - 1 file passed; 2 tests passed.
- RED (legacy passthrough): same command after adding preservation coverage
  - 1 failed because Zod stripped `legacy.summary` and `legacy.code`.
- GREEN: same command after adding `.passthrough()`
  - 1 file passed; 3 tests passed.

### Legacy migration

- RED: `pnpm vitest run tests/exercises/migration.test.ts`
  - Failed with `MODULE_NOT_FOUND` for `scripts/migrate-legacy-data.mjs`.
- GREEN: same command after implementing the VM loader, stable slug map, category/difficulty mapping, lossless legacy payload, cleanup, writing, and count assertion.
  - 1 file passed; 1 test passed; 19 JSON files validated.

### App shell redirect

- RED: `pnpm vitest run tests/app/page.test.ts`
  - Failed because `@/app/page` did not exist.
- GREEN: same command after implementing the redirect.
  - 1 file passed; 1 test passed.

## Installation and compatibility

- `pnpm install` completed with exit 0 and generated the committed lockfile.
- The supplied floating `typescript: latest` resolved to TypeScript 7.0.2, whose package exports are not recognized by Next.js 16.2.10. `pnpm-workspace.yaml` therefore pins the resolved compiler to TypeScript 5.9.3 while leaving the required `package.json` dependency value unchanged.
- The available bundled pnpm is 11.7.0 and warns that the required `packageManager: pnpm@10` is not an exact version. This warning is non-fatal; the value is preserved verbatim per the task brief.

## Fresh final verification

Command:

`node scripts/migrate-legacy-data.mjs && test "$(find exercises -name '*.json' -type f | wc -l | tr -d ' ')" = 19 && pnpm test && pnpm build && test -z "$(git status --short -- data.js app.js index.html styles.css)"`

Observed:

- Migration printed `Migrated 19 legacy exercises`.
- Vitest: 3 files passed, 5 tests passed, 0 failed.
- Next.js production build: compiled, TypeScript checked, and generated static pages successfully; exit 0.
- Legacy runtime preservation assertion exited 0.
- `git diff --check` and staged `git diff --cached --check` exited 0 before the implementation commit.

## Self-review

- The schema matches the required fields, defaults test timeouts to 1000 ms, and keeps additional legacy keys through validation.
- Stable slugs are explicit rather than title-derived, preventing accidental ID drift.
- The migration executes the legacy script in an isolated VM with only a fake `window`, asserts exactly 19 records, removes only stale JSON files in `exercises/`, and preserves the complete original record under `legacy`.
- Migration tests validate record count, exact slug set, filename/ID agreement, canonical schema conformance, and retention of every field shared by all legacy records.
- Existing unrelated runtime files are unchanged.

## Concerns

- Legacy source data does not contain executable argument/expected vectors for most exercises. Migration supplies a schema-valid compatibility test per record and preserves documented Event Loop answers; richer executable cases should be curated before these legacy records are used by the future Web Worker evaluator.
- The required non-exact `packageManager` value emits a warning under the bundled pnpm 11 runtime, though install, tests, and build all pass.
