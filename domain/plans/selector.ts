import type { ExerciseKind } from '@/domain/exercises/schema'

export type SelectedExercise = { id: string; kind: ExerciseKind }
export type SelectionProfile = { userId: string; now: Date }

export interface SelectionSource {
  findDueReview(profile: SelectionProfile, kind: ExerciseKind): Promise<SelectedExercise | null>
  findWeakTopic(profile: SelectionProfile, kind: ExerciseKind): Promise<SelectedExercise | null>
  findUnseen(profile: SelectionProfile, kind: ExerciseKind): Promise<SelectedExercise | null>
  findCompleted(profile: SelectionProfile, kind: ExerciseKind): Promise<SelectedExercise | null>
}

export interface ExerciseSelector {
  select(profile: SelectionProfile): Promise<[SelectedExercise, SelectedExercise]>
}

export function createExerciseSelector(source: SelectionSource): ExerciseSelector {
  return {
    async select(profile) {
      const choose = async (kind: ExerciseKind) => {
        const exercise = await source.findDueReview(profile, kind)
          ?? await source.findWeakTopic(profile, kind)
          ?? await source.findUnseen(profile, kind)
          ?? await source.findCompleted(profile, kind)
        if (!exercise) throw new Error(`NO_${kind.toUpperCase()}_EXERCISE_AVAILABLE`)
        if (exercise.kind !== kind) throw new Error('SELECTOR_KIND_MISMATCH')
        return exercise
      }
      return [await choose('algorithm'), await choose('frontend')]
    },
  }
}
