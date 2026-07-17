import { desc, eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { agentJobs, exercises, submissions } from '@/db/schema'
import { AgentResultSchema } from '@/domain/agents/contracts'
import { calculateProgressMetrics } from '@/domain/progress/metrics'

export default async function ProgressPage() {
  const session = await auth(); const userId = session?.user?.id
  if (!userId) return null
  const [exerciseRows, submissionRows, jobs] = await Promise.all([
    db.select().from(exercises),
    db.select().from(submissions).where(eq(submissions.userId, userId)).orderBy(submissions.createdAt),
    db.select().from(agentJobs).where(eq(agentJobs.userId, userId)).orderBy(desc(agentJobs.updatedAt)).limit(10),
  ])
  const exerciseMap = new Map(exerciseRows.map(row => [row.id, row.content]))
  const attempts = new Map<string, number>()
  const metrics = calculateProgressMetrics(submissionRows.map(row => {
    const attempt = (attempts.get(row.exerciseId) ?? 0) + 1; attempts.set(row.exerciseId, attempt)
    return { exerciseId: row.exerciseId, topics: exerciseMap.get(row.exerciseId)?.topics ?? [], attempt, passed: row.status === 'passed', durationMs: row.durationMs, completedAt: row.createdAt.toISOString() }
  }), new Date())
  const recommendation = jobs.map(job => AgentResultSchema.safeParse(job.result)).find(result => result.success && result.data.status === 'succeeded' && result.data.jobType === 'review-submission')
  const payload = recommendation?.success && recommendation.data.status === 'succeeded' && recommendation.data.jobType === 'review-submission' ? recommendation.data.payload : null
  return <main className="workbench-page"><header className="page-heading"><p className="exercise-kind">PROGRESS · LAST 7 DAYS</p><h1>成长报告</h1><p>不只数做了多少题，也看第一次如何思考。</p></header><div className="metric-strip"><article><span>一次通过率</span><strong>{Math.round(metrics.firstAttemptPassRate * 100)}%</strong></article><article><span>中位用时</span><strong>{Math.round(metrics.medianCompletionTimeMs / 1000)}s</strong></article><article><span>近 7 日完成</span><strong>{metrics.sevenDayCompletion.reduce((sum, day) => sum + day.completed, 0)}</strong></article></div><section className="progress-panel"><h2>七日完成</h2><div className="week-chart">{metrics.sevenDayCompletion.map(day => <div key={day.localDate}><span style={{ height: `${Math.max(6, Math.min(100, day.completed * 32))}%` }}/><b>{day.completed}</b><small>{day.localDate.slice(5)}</small></div>)}</div></section><section className="progress-panel"><h2>知识点掌握度</h2><div className="topic-bars">{metrics.masteryByTopic.map(topic => <div key={topic.topic}><span>{topic.topic}</span><div><i style={{ width: `${topic.rate * 100}%` }}/></div><b>{Math.round(topic.rate * 100)}%</b></div>)}</div></section><section className="agent-panel"><p className="exercise-kind">AGENT REVIEW</p><h2>{payload?.summary ?? '深度复盘处理中'}</h2>{payload ? <ul>{payload.improvements.map(item => <li key={item}>{item}</li>)}</ul> : <p>实时进度不受 Agent 状态影响。</p>}</section></main>
}
