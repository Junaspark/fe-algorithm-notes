import { NotificationOutboxAdapter } from '@/adapters/notifications/outbox'
import { db, sqlClient } from '@/db/client'
import { createReminderService } from '@/domain/reminders/service'
import { createPlanRepository } from './repository'
import { createExerciseSelector, type ExerciseSelector, type SelectedExercise, type SelectionProfile, type SelectionSource } from './selector'
import { createPlanService } from './service'
import type { ExerciseKind } from '@/domain/exercises/schema'

const plans = createPlanRepository(db)

const one = async (query: PromiseLike<readonly Record<string, unknown>[]>): Promise<SelectedExercise | null> => {
  const [row] = await query
  return row ? { id: String(row.id), kind: row.kind as ExerciseKind } : null
}

const source: SelectionSource = {
  findDueReview({ userId, now }: SelectionProfile, kind: ExerciseKind) {
    return one(sqlClient`select e.id, e.kind from reviews r join exercises e on e.id = r.exercise_id where r.user_id = ${userId} and r.status = 'pending' and r.due_at <= ${now} and e.kind = ${kind} order by r.due_at, r.created_at limit 1`)
  },
  findWeakTopic({ userId }: SelectionProfile, kind: ExerciseKind) {
    return one(sqlClient`select e.id, e.kind from exercises e where e.kind = ${kind} and jsonb_array_length(coalesce(e.content->'legacy'->'mistakes', '[]'::jsonb)) > 0 and not exists (select 1 from submissions s where s.user_id = ${userId} and s.exercise_id = e.id and s.status = 'passed') order by e.id limit 1`)
  },
  findUnseen({ userId }: SelectionProfile, kind: ExerciseKind) {
    return one(sqlClient`select e.id, e.kind from exercises e where e.kind = ${kind} and not exists (select 1 from submissions s where s.user_id = ${userId} and s.exercise_id = e.id) order by e.id limit 1`)
  },
}

const selector: ExerciseSelector = createExerciseSelector(source)

const ownerId = () => {
  const userId = process.env.OWNER_USER_ID
  if (!userId) throw new Error('OWNER_USER_ID is required')
  return userId
}

export async function createMorningRuntime() {
  const outbox = new NotificationOutboxAdapter()
  return { ...createPlanService({ userId: ownerId(), plans, selector, notifications: outbox }), takeReminder: () => outbox.take() }
}

export async function createEveningRuntime() {
  const outbox = new NotificationOutboxAdapter()
  return { ...createReminderService({ userId: ownerId(), plans, notifications: outbox }), takeReminder: () => outbox.take() }
}
