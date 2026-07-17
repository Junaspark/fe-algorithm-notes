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

export function shouldScheduleTimedInterview(completedPlans: number): boolean {
  return completedPlans > 0 && completedPlans % 7 === 0
}
