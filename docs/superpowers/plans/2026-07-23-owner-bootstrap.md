# Owner Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let scheduled jobs securely resolve the sole Junaspark database user after first login without requiring a manually copied ID.

**Architecture:** Add a small async resolver beside the plan runtime. It prefers the explicit deployment override and otherwise performs an exact normalized lookup that accepts one row only. Morning and evening runtime factories await the same resolver.

**Tech Stack:** TypeScript, Drizzle ORM, Vitest, Next.js, Netlify Database

## Global Constraints

- GitHub authorization remains limited to normalized login `Junaspark`.
- Zero, duplicate, or malformed database matches fail closed with `EXPECTED_ONE_OWNER_USER`.
- No new public endpoint exposes the owner ID.
- `.superpowers/sdd/progress.md` must remain uncommitted.

---

### Task 1: Resolve and inject the personal owner

**Files:**
- Create: `domain/auth/owner.ts`
- Modify: `domain/plans/runtime.ts`
- Create: `tests/auth/owner.test.ts`
- Create: `tests/plans/runtime-owner.test.ts`
- Modify: `docs/operations/netlify-production.md`

**Interfaces:**
- Produces: `resolveOwnerUserId(options?: { explicitId?: string; login?: string; query?: OwnerQuery }): Promise<string>`
- Consumes: a query returning records shaped as `{ id?: unknown }`
- Runtime factories accept an optional resolver dependency for isolated tests and otherwise call the production resolver.

- [ ] **Step 1: Write failing resolver tests**

```ts
it('prefers a non-empty explicit owner id without querying', async () => {
  const query = vi.fn()
  await expect(resolveOwnerUserId({ explicitId: 'owner-1', query })).resolves.toBe('owner-1')
  expect(query).not.toHaveBeenCalled()
})

it('requires exactly one valid Junaspark row', async () => {
  await expect(resolveOwnerUserId({ query: async () => [{ id: 'owner-2' }] })).resolves.toBe('owner-2')
  await expect(resolveOwnerUserId({ query: async () => [] })).rejects.toThrow('EXPECTED_ONE_OWNER_USER')
  await expect(resolveOwnerUserId({ query: async () => [{ id: 'a' }, { id: 'b' }] })).rejects.toThrow('EXPECTED_ONE_OWNER_USER')
  await expect(resolveOwnerUserId({ query: async () => [{ id: null }] })).rejects.toThrow('EXPECTED_ONE_OWNER_USER')
})
```

- [ ] **Step 2: Run the resolver tests and verify RED**

Run: `pnpm vitest run tests/auth/owner.test.ts`

Expected: FAIL because `domain/auth/owner.ts` does not exist.

- [ ] **Step 3: Implement the minimal fail-closed resolver**

```ts
import { sql } from 'drizzle-orm'
import { db } from '@/db/client'

export type OwnerQuery = (normalizedLogin: string) => Promise<Record<string, unknown>[]>

const defaultQuery: OwnerQuery = async normalizedLogin =>
  db.execute(sql`select id from "user" where lower(trim("githubLogin")) = ${normalizedLogin}`)

export async function resolveOwnerUserId({
  explicitId = process.env.OWNER_USER_ID,
  login = 'Junaspark',
  query = defaultQuery,
}: { explicitId?: string; login?: string; query?: OwnerQuery } = {}) {
  const override = explicitId?.trim()
  if (override) return override
  const rows = await query(login.trim().toLowerCase())
  if (rows.length !== 1 || typeof rows[0]?.id !== 'string' || !rows[0].id.trim()) {
    throw new Error(`EXPECTED_ONE_OWNER_USER: received ${rows.length}`)
  }
  return rows[0].id
}
```

- [ ] **Step 4: Run resolver tests and verify GREEN**

Run: `pnpm vitest run tests/auth/owner.test.ts`

Expected: all owner resolver tests pass.

- [ ] **Step 5: Write failing runtime injection tests**

```ts
it('uses the resolved owner for both scheduled runtimes', async () => {
  const resolveOwner = vi.fn().mockResolvedValue('owner-3')
  await createMorningRuntime({ resolveOwner })
  await createEveningRuntime({ resolveOwner })
  expect(resolveOwner).toHaveBeenCalledTimes(2)
})
```

The test should inject service/repository factories as needed so it verifies the owner passed to each service without contacting a database.

- [ ] **Step 6: Run runtime tests and verify RED**

Run: `pnpm vitest run tests/plans/runtime-owner.test.ts`

Expected: FAIL because runtime factories do not accept the resolver dependency.

- [ ] **Step 7: Make both runtime factories await the resolver**

Replace the synchronous `ownerId()` environment read with the shared async resolver. Keep default behavior unchanged for callers:

```ts
export async function createMorningRuntime(dependencies = runtimeDefaults) {
  const userId = await dependencies.resolveOwner()
  const outbox = new NotificationOutboxAdapter()
  return { ...createPlanService({ userId, plans, selector, notifications: outbox }), takeReminder: () => outbox.take() }
}
```

Apply the same pattern to `createEveningRuntime`.

- [ ] **Step 8: Verify focused and full suites**

Run:

```bash
pnpm vitest run tests/auth/owner.test.ts tests/plans/runtime-owner.test.ts tests/api/cron.test.ts
pnpm test
pnpm typecheck
pnpm lint
DATABASE_URL=http://unused.invalid AUTH_SECRET=build AUTH_GITHUB_ID=build AUTH_GITHUB_SECRET=build pnpm build:netlify
```

Expected: all commands exit 0.

- [ ] **Step 9: Update operations documentation**

Document `OWNER_USER_ID` as an optional override. State that the normal first-login flow resolves the unique `Junaspark` row and fails closed if uniqueness is violated.

- [ ] **Step 10: Commit**

```bash
git add domain/auth/owner.ts domain/plans/runtime.ts tests/auth/owner.test.ts tests/plans/runtime-owner.test.ts docs/operations/netlify-production.md docs/superpowers/specs/2026-07-23-owner-bootstrap-design.md docs/superpowers/plans/2026-07-23-owner-bootstrap.md
git commit -m "fix: bootstrap scheduled owner from GitHub login"
```
