export type ProgressAttempt = {
  exerciseId: string
  topics: string[]
  attempt: number
  passed: boolean
  durationMs: number
  completedAt: string
}

export type ProgressMetrics = {
  firstAttemptPassRate: number
  medianCompletionTimeMs: number
  masteryByTopic: Array<{ topic: string; passed: number; attempted: number; rate: number }>
  sevenDayCompletion: Array<{ localDate: string; completed: number }>
}

const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
})

function localDate(date: Date) {
  return shanghaiDate.format(date)
}

export function calculateProgressMetrics(attempts: ProgressAttempt[], now: Date): ProgressMetrics {
  const firstAttempts = attempts.filter(attempt => attempt.attempt === 1)
  const firstPasses = firstAttempts.filter(attempt => attempt.passed).length
  const completed = attempts.filter(attempt => attempt.passed)
  const durations = completed.map(attempt => attempt.durationMs).sort((a, b) => a - b)
  const middle = Math.floor(durations.length / 2)
  const medianCompletionTimeMs = durations.length === 0
    ? 0
    : durations.length % 2 === 1 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2

  const topics = new Map<string, { passed: number; attempted: number }>()
  for (const attempt of firstAttempts) {
    for (const topic of new Set(attempt.topics)) {
      const value = topics.get(topic) ?? { passed: 0, attempted: 0 }
      value.attempted += 1
      if (attempt.passed) value.passed += 1
      topics.set(topic, value)
    }
  }

  const currentLocalDate = localDate(now)
  const currentUtcMidnight = new Date(`${currentLocalDate}T00:00:00.000Z`)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentUtcMidnight)
    date.setUTCDate(date.getUTCDate() - (6 - index))
    return date.toISOString().slice(0, 10)
  })
  const counts = new Map(days.map(day => [day, 0]))
  for (const attempt of completed) {
    const day = localDate(new Date(attempt.completedAt))
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1)
  }

  return {
    firstAttemptPassRate: firstAttempts.length === 0 ? 0 : firstPasses / firstAttempts.length,
    medianCompletionTimeMs,
    masteryByTopic: [...topics].sort(([a], [b]) => a.localeCompare(b)).map(([topic, value]) => ({ topic, ...value, rate: value.passed / value.attempted })),
    sevenDayCompletion: days.map(day => ({ localDate: day, completed: counts.get(day) ?? 0 })),
  }
}
