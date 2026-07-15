import { and, desc, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

import * as schema from '@/db/schema'

export type Submission = typeof schema.submissions.$inferSelect
export type CreateSubmissionInput = Omit<typeof schema.submissions.$inferInsert, 'id' | 'createdAt'>

export interface SubmissionRepository {
  create(input: CreateSubmissionInput): Promise<Submission>
  find(id: string): Promise<Submission | null>
  listForExercise(userId: string, exerciseId: string): Promise<Submission[]>
}

export function createSubmissionRepository<TQuery extends PgQueryResultHKT>(db: PgDatabase<TQuery, typeof schema>): SubmissionRepository {
  return {
    async create(input) {
      const [submission] = await db.insert(schema.submissions).values(input).returning()
      return submission
    },
    async find(id) {
      const [submission] = await db.select().from(schema.submissions).where(eq(schema.submissions.id, id)).limit(1)
      return submission ?? null
    },
    listForExercise(userId, exerciseId) {
      return db.select().from(schema.submissions).where(and(eq(schema.submissions.userId, userId), eq(schema.submissions.exerciseId, exerciseId))).orderBy(desc(schema.submissions.createdAt), desc(schema.submissions.id))
    },
  }
}
