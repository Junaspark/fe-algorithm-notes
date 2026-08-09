import { NotificationOutboxAdapter } from '@/adapters/notifications/outbox'
import { db, sqlClient } from '@/db/client'
import { resolveOwnerUserId } from '@/domain/auth/owner'
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

export const toSqlTimestamp = (value: Date): string => value.toISOString()

const source: SelectionSource = {
  findDueReview({ userId, now }: SelectionProfile, kind: ExerciseKind) {
    return one(sqlClient`select e.id, e.kind from reviews r join exercises e on e.id = r.exercise_id where r.user_id = ${userId} and r.status = 'pending' and r.due_at <= ${toSqlTimestamp(now)} and e.kind = ${kind} and e.active = true order by r.due_at, r.created_at limit 1`)
  },
  findWeakTopic({ userId }: SelectionProfile, kind: ExerciseKind) {
    return one(sqlClient`select e.id, e.kind from exercises e where e.kind = ${kind} and e.active = true and jsonb_array_length(coalesce(e.content->'legacy'->'mistakes', '[]'::jsonb)) > 0 and not exists (select 1 from submissions s where s.user_id = ${userId} and s.exercise_id = e.id and s.status = 'passed') order by e.id limit 1`)
  },
  findUnseen({ userId }: SelectionProfile, kind: ExerciseKind) {
    return one(sqlClient`select e.id, e.kind from exercises e where e.kind = ${kind} and e.active = true and not exists (select 1 from submissions s where s.user_id = ${userId} and s.exercise_id = e.id) order by e.id limit 1`)
  },
  findCompleted({ userId }: SelectionProfile, kind: ExerciseKind) {
    return one(sqlClient`select e.id, e.kind from exercises e where e.kind = ${kind} and e.active = true and exists (select 1 from submissions s where s.user_id = ${userId} and s.exercise_id = e.id and s.status = 'passed') order by (select max(s.created_at) from submissions s where s.user_id = ${userId} and s.exercise_id = e.id and s.status = 'passed'), e.id limit 1`)
  },
}

const selector: ExerciseSelector = createExerciseSelector(source)

type RuntimeDependencies = {
  resolveOwner(): Promise<string>
}

const runtimeDefaults: RuntimeDependencies = {
  resolveOwner: resolveOwnerUserId,
}

export async function createMorningRuntime(dependencies: RuntimeDependencies = runtimeDefaults) {
  const userId = await dependencies.resolveOwner()
  const outbox = new NotificationOutboxAdapter()
  return { ...createPlanService({ userId, plans, selector, notifications: outbox }), takeReminder: () => outbox.take() }
}

export async function createEveningRuntime(dependencies: RuntimeDependencies = runtimeDefaults) {
  const userId = await dependencies.resolveOwner()
  const outbox = new NotificationOutboxAdapter()
  return { ...createReminderService({ userId, plans, notifications: outbox }), takeReminder: () => outbox.take() }
}
