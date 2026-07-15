import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as schema from '@/db/schema'
import { createDraftRepository, createPlanRepository } from '@/domain/plans/repository'
import { createSubmissionRepository } from '@/domain/submissions/repository'
import { seedExercises } from '@/scripts/seed'

const exercise = (id: string, kind: 'algorithm' | 'frontend') => ({
  id,
  title: id,
  kind,
  difficulty: 'medium' as const,
  language: 'javascript' as const,
  topics: ['test'],
  prompt: 'Solve it',
  starterCode: '',
  publicTests: [{ name: 'works', args: [], expected: true, timeoutMs: 1000 }],
  hiddenTests: [],
})

describe('PostgreSQL repositories', () => {
  let client: PGlite
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(async () => {
    client = new PGlite()
    db = drizzle(client, { schema })
    const migration = await readFile(path.join(process.cwd(), 'drizzle/0000_silky_juggernaut.sql'), 'utf8')
    await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    await db.insert(schema.exercises).values([
      { id: 'a', kind: 'algorithm', version: 1, content: exercise('a', 'algorithm') },
      { id: 'b', kind: 'frontend', version: 1, content: exercise('b', 'frontend') },
      { id: 'c', kind: 'algorithm', version: 1, content: exercise('c', 'algorithm') },
      { id: 'd', kind: 'frontend', version: 1, content: exercise('d', 'frontend') },
    ])
  })

  afterEach(async () => client.close())

  it('enforces one incomplete plan and preserves draft versions', async () => {
    const plans = createPlanRepository(db)
    const drafts = createDraftRepository(db)
    const userId = '00000000-0000-4000-8000-000000000001'

    const first = await plans.create({ userId, localDate: '2026-07-15', exerciseIds: ['a', 'b'] })
    await expect(plans.create({ userId, localDate: '2026-07-16', exerciseIds: ['c', 'd'] })).rejects.toThrow('ACTIVE_PLAN_EXISTS')
    const v1 = await drafts.save({ userId, exerciseId: 'a', code: 'v1', expectedVersion: 0 })
    await expect(drafts.save({ userId, exerciseId: 'a', code: 'v2', expectedVersion: 0 })).rejects.toThrow('DRAFT_CONFLICT')

    expect(first.status).toBe('active')
    expect(first.items.map(({ exerciseId }) => exerciseId)).toEqual(['a', 'b'])
    expect(v1.version).toBe(1)
    await expect(drafts.find(userId, 'a')).resolves.toMatchObject({ code: 'v1', version: 1 })
  })

  it('marks an item complete and completes the plan only after both items pass', async () => {
    const plans = createPlanRepository(db)
    const userId = '00000000-0000-4000-8000-000000000002'
    const plan = await plans.create({ userId, localDate: '2026-07-15', exerciseIds: ['a', 'b'] })
    const submissionIds = [crypto.randomUUID(), crypto.randomUUID()]

    await db.insert(schema.submissions).values([
      { id: submissionIds[0], userId, exerciseId: 'a', code: 'a', status: 'passed', testResult: { passed: 1, failed: 0 } },
      { id: submissionIds[1], userId, exerciseId: 'b', code: 'b', status: 'passed', testResult: { passed: 1, failed: 0 } },
    ])

    const active = await plans.markItemComplete(plan.id, 'a', submissionIds[0])
    const complete = await plans.markItemComplete(plan.id, 'b', submissionIds[1])

    expect(active.status).toBe('active')
    expect(complete.status).toBe('completed')
    await expect(plans.findActive(userId)).resolves.toBeNull()
  })

  it('rejects a passing submission owned by another user', async () => {
    const plans = createPlanRepository(db)
    const ownerId = '00000000-0000-4000-8000-000000000004'
    const attackerId = '00000000-0000-4000-8000-000000000005'
    const plan = await plans.create({ userId: ownerId, localDate: '2026-07-15', exerciseIds: ['a', 'b'] })
    const [submission] = await db.insert(schema.submissions).values({
      userId: attackerId,
      exerciseId: 'a',
      code: 'stolen pass',
      status: 'passed',
      testResult: { passed: 1, failed: 0 },
    }).returning()

    await expect(plans.markItemComplete(plan.id, 'a', submission.id)).rejects.toThrow('PASSING_SUBMISSION_REQUIRED')
    await expect(plans.findActive(ownerId)).resolves.toMatchObject({
      items: [expect.objectContaining({ exerciseId: 'a', status: 'pending' }), expect.objectContaining({ exerciseId: 'b', status: 'pending' })],
    })
  })

  it('serializes simultaneous item completions and completes the plan', async () => {
    const plans = createPlanRepository(db)
    const userId = '00000000-0000-4000-8000-000000000006'
    const plan = await plans.create({ userId, localDate: '2026-07-15', exerciseIds: ['a', 'b'] })
    const inserted = await db.insert(schema.submissions).values([
      { userId, exerciseId: 'a', code: 'a', status: 'passed', testResult: { passed: 1, failed: 0 } },
      { userId, exerciseId: 'b', code: 'b', status: 'passed', testResult: { passed: 1, failed: 0 } },
    ]).returning()

    await Promise.all([
      plans.markItemComplete(plan.id, 'a', inserted[0].id),
      plans.markItemComplete(plan.id, 'b', inserted[1].id),
    ])

    await expect(plans.findActive(userId)).resolves.toBeNull()
    const [completed] = await db.select().from(schema.dailyPlans).where(eq(schema.dailyPlans.id, plan.id))
    expect(completed.status).toBe('completed')
  })

  it('persists and lists submission attempts newest first', async () => {
    const submissions = createSubmissionRepository(db)
    const userId = '00000000-0000-4000-8000-000000000003'
    const first = await submissions.create({ userId, exerciseId: 'a', code: 'v1', status: 'failed', testResult: { passed: 0, failed: 1 } })
    const second = await submissions.create({ userId, exerciseId: 'a', code: 'v2', status: 'passed', testResult: { passed: 1, failed: 0 } })

    await expect(submissions.find(first.id)).resolves.toMatchObject({ code: 'v1' })
    await expect(submissions.listForExercise(userId, 'a')).resolves.toEqual([
      expect.objectContaining({ id: second.id }),
      expect.objectContaining({ id: first.id }),
    ])
  })

  it('seeds all 19 canonical exercises idempotently', async () => {
    await db.delete(schema.exercises)

    await expect(seedExercises(db)).resolves.toBe(19)
    await expect(seedExercises(db)).resolves.toBe(19)
    const [result] = await db.select({ value: count() }).from(schema.exercises)
    expect(result.value).toBe(19)
  })
})
