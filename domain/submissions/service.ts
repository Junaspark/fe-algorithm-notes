import { and, asc, eq } from 'drizzle-orm'
import type { SubmissionInput } from '@/app/api/submissions/route'
import { db } from '@/db/client'
import * as schema from '@/db/schema'

export async function persistPassingSubmission(input: SubmissionInput) {
  return db.transaction(async tx => {
    const [exercise] = await tx.select().from(schema.exercises).where(eq(schema.exercises.id, input.exerciseId)).limit(1)
    if (!exercise) throw new Error('EXERCISE_NOT_FOUND')
    const authoredTests = [...exercise.content.publicTests, ...exercise.content.hiddenTests]
    if (authoredTests.length !== input.evidence.tests.length || authoredTests.some((test, index) => test.name !== input.evidence.tests[index]?.name)) throw new Error('FULL_TEST_EVIDENCE_MISMATCH')
    const [plan] = await tx.select().from(schema.dailyPlans).where(and(eq(schema.dailyPlans.userId, input.userId), eq(schema.dailyPlans.status, 'active'))).for('update').limit(1)
    if (!plan) throw new Error('ACTIVE_PLAN_NOT_FOUND')
    const [item] = await tx.select().from(schema.planItems).where(and(eq(schema.planItems.planId, plan.id), eq(schema.planItems.exerciseId, input.exerciseId))).limit(1)
    if (!item) throw new Error('EXERCISE_NOT_IN_ACTIVE_PLAN')
    const [submission] = await tx.insert(schema.submissions).values({ userId: input.userId, exerciseId: input.exerciseId, code: input.code, status: 'passed', testResult: { passed: input.evidence.tests.length, failed: 0 } }).returning()
    await tx.update(schema.planItems).set({ status: 'completed', submissionId: submission.id, completedAt: new Date() }).where(and(eq(schema.planItems.planId, plan.id), eq(schema.planItems.exerciseId, input.exerciseId)))
    const items = await tx.select().from(schema.planItems).where(eq(schema.planItems.planId, plan.id)).orderBy(asc(schema.planItems.position))
    const planCompleted = items.every(candidate => candidate.exerciseId === input.exerciseId || candidate.status === 'completed')
    if (planCompleted) {
      await tx.update(schema.dailyPlans).set({ status: 'completed', completedAt: new Date() }).where(eq(schema.dailyPlans.id, plan.id))
      await tx.insert(schema.gitSyncJobs).values({ userId: input.userId, planId: plan.id }).onConflictDoNothing()
      await tx.insert(schema.agentJobs).values({ userId: input.userId, payloadVersion: 1, payload: { submissionId: submission.id, planId: plan.id } })
    }
    return { submissionId: submission.id, completed: true, planCompleted }
  })
}
