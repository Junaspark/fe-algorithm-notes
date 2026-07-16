import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as schema from '@/db/schema'
import { createDraftRepository, createPlanRepository } from '@/domain/plans/repository'
import { createSubmissionRepository } from '@/domain/submissions/repository'
import { createPassingSubmissionPersistence } from '@/domain/submissions/service'
import { DrizzleAgentJobRepository } from '@/adapters/agents/codex-bridge'
import type { AgentJob } from '@/domain/agents/contracts'
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
    for (const name of ['0002_rich_raider.sql', '0003_lucky_phil_sheldon.sql', '0004_agent_job_leases.sql']) {
      await client.exec((await readFile(path.join(process.cwd(), 'drizzle', name), 'utf8')).replaceAll('--> statement-breakpoint', ''))
    }
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

  it('persists exact active-plan submissions and creates one job of each type under replay', async () => {
    const plans = createPlanRepository(db)
    const persist = createPassingSubmissionPersistence(db)
    const userId = '00000000-0000-4000-8000-000000000007'
    await plans.create({ userId, localDate: '2026-07-15', exerciseIds: ['a', 'b'] })
    const input = (exerciseId: string, requestId: string) => ({ userId, exerciseId, code: `function ${exerciseId}(){return true}`, complexityAnswer: 'O(1)', elapsedSeconds: 5, evidence: { scope: 'full' as const, requestId, tests: [{ name: 'works', status: 'passed' as const }] } })

    await expect(persist({ ...input('a', 'bad-suite'), evidence: { ...input('a', 'bad-suite').evidence, tests: [{ name: 'invented', status: 'passed' }] } })).rejects.toThrow('FULL_TEST_EVIDENCE_MISMATCH')
    await expect(persist({ ...input('a', 'wrong-owner'), userId: '00000000-0000-4000-8000-000000000008' })).rejects.toThrow('ACTIVE_PLAN_NOT_FOUND')
    await expect(persist(input('a', 'run-a'))).resolves.toMatchObject({ planCompleted: false })
    const completed = await persist(input('b', 'run-b'))
    const replay = await persist(input('b', 'run-b'))

    expect(replay.submissionId).toBe(completed.submissionId)
    expect(replay.planCompleted).toBe(true)
    expect((await db.select().from(schema.planItems)).every(item => item.status === 'completed')).toBe(true)
    expect(await db.select().from(schema.gitSyncJobs)).toHaveLength(1)
    expect(await db.select().from(schema.agentJobs)).toHaveLength(1)
    expect((await db.select().from(schema.agentJobs))[0]).toMatchObject({ submissionId: completed.submissionId })
  })

  it('linearizes concurrent retries of the final passing submission', async () => {
    const userId = '00000000-0000-4000-8000-000000000009'
    await createPlanRepository(db).create({ userId, localDate: '2026-07-15', exerciseIds: ['a', 'b'] })
    const input = (exerciseId: string, requestId: string) => ({
      userId,
      exerciseId,
      code: `function ${exerciseId}(){return true}`,
      complexityAnswer: 'O(1)',
      elapsedSeconds: 5,
      evidence: { scope: 'full' as const, requestId, tests: [{ name: 'works', status: 'passed' as const }] },
    })
    const persist = createPassingSubmissionPersistence(db)
    await persist(input('a', 'run-a'))

    let selectCount = 0
    const winnerCompleted = persist(input('b', 'run-final'))
    const staleReplayDb = {
      transaction: async (callback: (tx: unknown) => unknown) => {
        await winnerCompleted
        await db.select().from(schema.dailyPlans).where(eq(schema.dailyPlans.userId, userId))
        return db.transaction(async tx => callback(new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== 'select') return Reflect.get(target, property, receiver)
            return (...args: unknown[]) => {
              selectCount += 1
              if (selectCount !== 2 && selectCount !== 3) return Reflect.apply(target.select, target, args)
              return {
                from: () => ({
                  where: () => ({
                    for: () => ({
                      limit: async () => [],
                    }),
                    limit: async () => [],
                  }),
                }),
              }
            }
          },
        })))
      },
    } as unknown as typeof db

    const results = await Promise.all([
      winnerCompleted,
      createPassingSubmissionPersistence(staleReplayDb)(input('b', 'run-final')),
    ])

    expect(results[0]).toEqual(results[1])
    expect(results[0].planCompleted).toBe(true)
    expect(await db.select().from(schema.submissions).where(eq(schema.submissions.requestId, 'run-final'))).toHaveLength(1)
    expect(await db.select().from(schema.gitSyncJobs)).toHaveLength(1)
    expect(await db.select().from(schema.agentJobs)).toHaveLength(1)
  })

  it('upgrades legacy Agent jobs to required submission associations safely', async () => {
    const legacyClient = new PGlite()

    try {
      const base = await readFile(path.join(process.cwd(), 'drizzle/0000_silky_juggernaut.sql'), 'utf8')
      await legacyClient.exec(base.replaceAll('--> statement-breakpoint', ''))
      await legacyClient.exec(`
        INSERT INTO agent_jobs (user_id, payload_version, payload)
        VALUES ('00000000-0000-4000-8000-000000000010', 1, '{}')
      `)
      await legacyClient.exec(await readFile(path.join(process.cwd(), 'drizzle/0002_rich_raider.sql'), 'utf8'))
      const associationMigration = await readFile(path.join(process.cwd(), 'drizzle/0003_lucky_phil_sheldon.sql'), 'utf8')
      await legacyClient.exec(associationMigration.replaceAll('--> statement-breakpoint', ''))
      await legacyClient.exec((await readFile(path.join(process.cwd(), 'drizzle/0004_agent_job_leases.sql'), 'utf8')).replaceAll('--> statement-breakpoint', ''))

      const jobs = await legacyClient.query('SELECT * FROM agent_jobs')
      const columns = await legacyClient.query<{ column_name: string; is_nullable: string }>(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'agent_jobs' AND column_name IN ('plan_id', 'submission_id')
        ORDER BY column_name
      `)
      expect(jobs.rows).toHaveLength(0)
      expect(columns.rows).toEqual([
        { column_name: 'plan_id', is_nullable: 'NO' },
        { column_name: 'submission_id', is_nullable: 'YES' },
      ])
    } finally {
      await legacyClient.close()
    }
  })

  it('persists review and selection jobs and atomically leases each once', async () => {
    const userId = '00000000-0000-4000-8000-000000000011'
    const plan = await createPlanRepository(db).create({ userId, localDate: '2026-07-16', exerciseIds: ['a', 'b'] })
    const [submission] = await db.insert(schema.submissions).values({ userId, exerciseId: 'a', code: 'ok', status: 'passed', testResult: { passed: 1, failed: 0 } }).returning()
    const base = {
      schemaVersion: 'agent-job.v1' as const, userId, planId: plan.id, attempt: 1, maxAttempts: 3,
      deadline: '2026-07-16T10:00:00.000Z',
    }
    const review: AgentJob = {
      ...base, id: crypto.randomUUID(), jobType: 'review-submission', submissionId: submission.id,
      idempotencyKey: `review:${submission.id}`,
      context: { exerciseId: 'a', exerciseKind: 'algorithm', code: 'ok', testSummary: { passed: 1, failed: 0 } },
    }
    const selection: AgentJob = {
      ...base, id: crypto.randomUUID(), jobType: 'select-exercises', idempotencyKey: `select:${plan.id}`,
      context: { localDate: '2026-07-16', candidates: [{ id: 'a', kind: 'algorithm', difficulty: 'medium' }, { id: 'b', kind: 'frontend', difficulty: 'medium' }], recentExerciseIds: [] },
    }
    const repository = new DrizzleAgentJobRepository(db)
    await repository.persist(review)
    await repository.persist(selection)
    await expect(repository.persist({ ...selection, deadline: '2026-07-16T11:00:00.000Z' })).rejects.toThrow('AGENT_JOB_IMMUTABLE_MISMATCH')
    const [first, second] = await Promise.all([
      repository.claim(10, 'worker-a', new Date('2026-07-16T09:00:00Z'), 60_000),
      repository.claim(10, 'worker-b', new Date('2026-07-16T09:00:00Z'), 60_000),
    ])
    expect([...first, ...second]).toHaveLength(2)
    expect(new Set([...first, ...second].map(claim => claim.job.id)).size).toBe(2)
    expect(await repository.claim(10, 'worker-c', new Date('2026-07-16T09:00:30Z'), 60_000)).toEqual([])
    expect(await repository.claim(10, 'worker-c', new Date('2026-07-16T09:01:01Z'), 60_000)).toHaveLength(2)
  })

  it('quarantines an invalid legacy row without blocking valid claims', async () => {
    const userId = '00000000-0000-4000-8000-000000000012'
    const plan = await createPlanRepository(db).create({ userId, localDate: '2026-07-16', exerciseIds: ['a', 'b'] })
    await db.insert(schema.agentJobs).values({
      userId, planId: plan.id, jobType: 'select-exercises', idempotencyKey: 'bad', payloadVersion: 1, payload: {},
    })
    const valid: AgentJob = {
      schemaVersion: 'agent-job.v1', id: crypto.randomUUID(), jobType: 'select-exercises', userId, planId: plan.id,
      idempotencyKey: 'good', attempt: 1, maxAttempts: 3, deadline: '2026-07-16T10:00:00.000Z',
      context: { localDate: '2026-07-16', candidates: [{ id: 'a', kind: 'algorithm', difficulty: 'medium' }, { id: 'b', kind: 'frontend', difficulty: 'medium' }], recentExerciseIds: [] },
    }
    const repository = new DrizzleAgentJobRepository(db)
    await repository.persist(valid)
    const claims = await repository.claim(10, 'worker', new Date('2026-07-16T09:00:00Z'), 60_000)
    expect(claims.map(claim => claim.job.id)).toEqual([valid.id])
    expect((await db.select().from(schema.agentJobs).where(eq(schema.agentJobs.idempotencyKey, 'bad')))[0].status).toBe('failed')
  })
})
