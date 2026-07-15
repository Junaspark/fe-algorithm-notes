import { and, asc, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

import * as schema from '@/db/schema'

export type PlanItem = typeof schema.planItems.$inferSelect
export type DailyPlan = typeof schema.dailyPlans.$inferSelect & { items: PlanItem[] }
export type Draft = typeof schema.drafts.$inferSelect
export type CreatePlanInput = { userId: string; localDate: string; exerciseIds: [string, string] | string[] }

export interface PlanRepository {
  findActive(userId: string): Promise<DailyPlan | null>
  create(input: CreatePlanInput): Promise<DailyPlan>
  markItemComplete(planId: string, exerciseId: string, submissionId: string): Promise<DailyPlan>
}

export interface DraftRepository {
  save(input: { userId: string; exerciseId: string; code: string; expectedVersion: number }): Promise<Draft>
  find(userId: string, exerciseId: string): Promise<Draft | null>
}

type Database<TQuery extends PgQueryResultHKT> = PgDatabase<TQuery, typeof schema>

const isConstraintViolation = (error: unknown, constraint: string): boolean => {
  if (!(error instanceof Error)) return false
  const candidate = error as Error & { code?: string; constraint?: string; cause?: unknown }
  return (candidate.code === '23505' && (candidate.constraint === constraint || candidate.message.includes(constraint)))
    || isConstraintViolation(candidate.cause, constraint)
}

export function createPlanRepository<TQuery extends PgQueryResultHKT>(db: Database<TQuery>): PlanRepository {
  const load = async (executor: Database<TQuery>, plan: typeof schema.dailyPlans.$inferSelect): Promise<DailyPlan> => ({
    ...plan,
    items: await executor.select().from(schema.planItems).where(eq(schema.planItems.planId, plan.id)).orderBy(asc(schema.planItems.position)),
  })

  return {
    async findActive(userId) {
      const [plan] = await db.select().from(schema.dailyPlans).where(and(eq(schema.dailyPlans.userId, userId), eq(schema.dailyPlans.status, 'active'))).limit(1)
      return plan ? load(db, plan) : null
    },

    async create(input) {
      if (input.exerciseIds.length !== 2) throw new Error('PLAN_REQUIRES_TWO_EXERCISES')
      try {
        return await db.transaction(async (tx) => {
          const kinds = await tx.select({ id: schema.exercises.id, kind: schema.exercises.kind }).from(schema.exercises).where(sql`${schema.exercises.id} in ${input.exerciseIds}`)
          if (kinds.length !== 2 || new Set(kinds.map(({ kind }) => kind)).size !== 2) throw new Error('PLAN_REQUIRES_ALGORITHM_AND_FRONTEND')
          const [plan] = await tx.insert(schema.dailyPlans).values({ userId: input.userId, localDate: input.localDate }).returning()
          await tx.insert(schema.planItems).values(input.exerciseIds.map((exerciseId, position) => ({ planId: plan.id, exerciseId, position })))
          return load(tx as Database<TQuery>, plan)
        })
      } catch (error) {
        if (isConstraintViolation(error, 'daily_plans_one_active_per_user')) throw new Error('ACTIVE_PLAN_EXISTS', { cause: error })
        throw error
      }
    },

    async markItemComplete(planId, exerciseId, submissionId) {
      return db.transaction(async (tx) => {
        const [lockedPlan] = await tx.select().from(schema.dailyPlans).where(eq(schema.dailyPlans.id, planId)).for('update').limit(1)
        if (!lockedPlan) throw new Error('PLAN_NOT_FOUND')
        const [submission] = await tx.select().from(schema.submissions).where(and(eq(schema.submissions.id, submissionId), eq(schema.submissions.userId, lockedPlan.userId), eq(schema.submissions.exerciseId, exerciseId), eq(schema.submissions.status, 'passed'))).limit(1)
        if (!submission) throw new Error('PASSING_SUBMISSION_REQUIRED')
        await tx.update(schema.planItems).set({ status: 'completed', submissionId, completedAt: new Date() }).where(and(eq(schema.planItems.planId, planId), eq(schema.planItems.exerciseId, exerciseId)))
        const [{ pending }] = await tx.select({ pending: sql<number>`count(*) filter (where ${schema.planItems.status} = 'pending')::int` }).from(schema.planItems).where(eq(schema.planItems.planId, planId))
        if (pending === 0) await tx.update(schema.dailyPlans).set({ status: 'completed', completedAt: new Date() }).where(eq(schema.dailyPlans.id, planId))
        const [plan] = await tx.select().from(schema.dailyPlans).where(eq(schema.dailyPlans.id, planId)).limit(1)
        if (!plan) throw new Error('PLAN_NOT_FOUND')
        return load(tx as Database<TQuery>, plan)
      })
    },
  }
}

export function createDraftRepository<TQuery extends PgQueryResultHKT>(db: Database<TQuery>): DraftRepository {
  return {
    async find(userId, exerciseId) {
      const [draft] = await db.select().from(schema.drafts).where(and(eq(schema.drafts.userId, userId), eq(schema.drafts.exerciseId, exerciseId))).limit(1)
      return draft ?? null
    },

    async save(input) {
      if (input.expectedVersion === 0) {
        try {
          const [draft] = await db.insert(schema.drafts).values({ userId: input.userId, exerciseId: input.exerciseId, code: input.code, version: 1 }).returning()
          return draft
        } catch (error) {
          if (isConstraintViolation(error, 'drafts_user_exercise')) throw new Error('DRAFT_CONFLICT', { cause: error })
          throw error
        }
      }
      const [draft] = await db.update(schema.drafts).set({ code: input.code, version: input.expectedVersion + 1, updatedAt: new Date() }).where(and(eq(schema.drafts.userId, input.userId), eq(schema.drafts.exerciseId, input.exerciseId), eq(schema.drafts.version, input.expectedVersion))).returning()
      if (!draft) throw new Error('DRAFT_CONFLICT')
      return draft
    },
  }
}
