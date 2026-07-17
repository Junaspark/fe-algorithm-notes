export type DueReview = { id: string; topic: string; dueAt: string }

export function orderDueReviews<T extends DueReview>(reviews: T[], now: Date): T[] {
  const remaining = reviews
    .filter(review => new Date(review.dueAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() || a.id.localeCompare(b.id))
  const ordered: T[] = []
  while (remaining.length > 0) {
    const lastTopic = ordered.at(-1)?.topic
    const alternative = remaining.findIndex(review => review.topic !== lastTopic)
    const index = alternative >= 0 ? alternative : 0
    ordered.push(...remaining.splice(index, 1))
  }
  return ordered
}

export type PlanMode = 'practice' | 'timed'

export function scheduleTimedInterview(completedPlans: number): PlanMode {
  return completedPlans > 0 && completedPlans % 7 === 0 ? 'timed' : 'practice'
}

export function selectNextPendingReview<T extends { exerciseId: string; status: string; dueAt: Date }>(reviews: T[], exerciseId: string): T | undefined {
  return reviews
    .filter(review => review.exerciseId === exerciseId && review.status === 'pending')
    .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())[0]
}
