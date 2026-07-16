import { and, asc, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { SubmissionInput } from '@/app/api/submissions/route'
import * as schema from '@/db/schema'
import { AgentJobSchema } from '@/domain/agents/contracts'

type SubmissionDatabase<TQuery extends PgQueryResultHKT> = PgDatabase<TQuery, typeof schema>

export function createPassingSubmissionPersistence<TQuery extends PgQueryResultHKT>(database: SubmissionDatabase<TQuery>) {
  return async function persist(input: SubmissionInput) {
    return database.transaction(async tx => {
      const [exercise] = await tx.select().from(schema.exercises).where(eq(schema.exercises.id, input.exerciseId)).limit(1)
      if (!exercise) throw new Error('EXERCISE_NOT_FOUND')
      const authoredTests = [...exercise.content.publicTests, ...exercise.content.hiddenTests]
      if (authoredTests.length !== input.evidence.tests.length || authoredTests.some((test, index) => test.name !== input.evidence.tests[index]?.name)) throw new Error('FULL_TEST_EVIDENCE_MISMATCH')

      const [prior] = await tx.select().from(schema.submissions).where(and(eq(schema.submissions.userId, input.userId), eq(schema.submissions.exerciseId, input.exerciseId), eq(schema.submissions.requestId, input.evidence.requestId))).limit(1)
      if (prior) {
        const [state] = await tx.select({ status: schema.dailyPlans.status }).from(schema.planItems).innerJoin(schema.dailyPlans, eq(schema.planItems.planId, schema.dailyPlans.id)).where(eq(schema.planItems.submissionId, prior.id)).limit(1)
        return { submissionId: prior.id, completed: true, planCompleted: state?.status === 'completed' }
      }

      const [plan] = await tx.select().from(schema.dailyPlans).where(and(eq(schema.dailyPlans.userId, input.userId), eq(schema.dailyPlans.status, 'active'))).for('update').limit(1)
      if (!plan) {
        const [replayed] = await tx.select().from(schema.submissions).where(and(eq(schema.submissions.userId, input.userId), eq(schema.submissions.exerciseId, input.exerciseId), eq(schema.submissions.requestId, input.evidence.requestId))).limit(1)
        if (!replayed) throw new Error('ACTIVE_PLAN_NOT_FOUND')
        const [state] = await tx.select({ status: schema.dailyPlans.status }).from(schema.planItems).innerJoin(schema.dailyPlans, eq(schema.planItems.planId, schema.dailyPlans.id)).where(eq(schema.planItems.submissionId, replayed.id)).limit(1)
        return { submissionId: replayed.id, completed: true, planCompleted: state?.status === 'completed' }
      }
      const [item] = await tx.select().from(schema.planItems).where(and(eq(schema.planItems.planId, plan.id), eq(schema.planItems.exerciseId, input.exerciseId))).limit(1)
      if (!item) throw new Error('EXERCISE_NOT_IN_ACTIVE_PLAN')
      const [submission] = await tx.insert(schema.submissions).values({ userId: input.userId, exerciseId: input.exerciseId, requestId: input.evidence.requestId, code: input.code, status: 'passed', testResult: { passed: input.evidence.tests.length, failed: 0 } }).onConflictDoNothing().returning()
      if (!submission) {
        const [replayed] = await tx.select().from(schema.submissions).where(and(eq(schema.submissions.userId, input.userId), eq(schema.submissions.exerciseId, input.exerciseId), eq(schema.submissions.requestId, input.evidence.requestId))).limit(1)
        if (!replayed) throw new Error('SUBMISSION_REPLAY_LOOKUP_FAILED')
        return { submissionId: replayed.id, completed: true, planCompleted: false }
      }
      await tx.update(schema.planItems).set({ status: 'completed', submissionId: submission.id, completedAt: new Date() }).where(and(eq(schema.planItems.planId, plan.id), eq(schema.planItems.exerciseId, input.exerciseId)))
      const items = await tx.select().from(schema.planItems).where(eq(schema.planItems.planId, plan.id)).orderBy(asc(schema.planItems.position))
      const planCompleted = items.every(candidate => candidate.exerciseId === input.exerciseId || candidate.status === 'completed')
      if (planCompleted) {
        await tx.update(schema.dailyPlans).set({ status: 'completed', completedAt: new Date() }).where(eq(schema.dailyPlans.id, plan.id))
        await tx.insert(schema.gitSyncJobs).values({ userId: input.userId, planId: plan.id }).onConflictDoNothing()
        const agentJobId = crypto.randomUUID()
        const agentJob = AgentJobSchema.parse({
          schemaVersion: 'agent-job.v1', id: agentJobId, jobType: 'review-submission',
          userId: input.userId, planId: plan.id, submissionId: submission.id,
          idempotencyKey: `review:${submission.id}`, attempt: 1, maxAttempts: 3,
          deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          context: { exerciseId: input.exerciseId, exerciseKind: exercise.kind, code: input.code, testSummary: { passed: input.evidence.tests.length, failed: 0 } },
        })
        await tx.insert(schema.agentJobs).values({
          id: agentJobId,
          userId: input.userId,
          planId: plan.id,
          submissionId: submission.id,
          jobType: agentJob.jobType,
          idempotencyKey: agentJob.idempotencyKey,
          attempt: agentJob.attempt,
          payloadVersion: 1,
          payload: agentJob,
        }).onConflictDoNothing()
      }
      return { submissionId: submission.id, completed: true, planCompleted }
    })
  }
}

export async function persistPassingSubmission(input: SubmissionInput) {
  const { db } = await import('@/db/client')
  return createPassingSubmissionPersistence(db)(input)
}
