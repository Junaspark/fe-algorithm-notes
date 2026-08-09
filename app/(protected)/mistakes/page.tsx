import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { exercises, reviews, submissions } from '@/db/schema'
import { selectNextPendingReview } from '@/domain/reviews/schedule'

export default async function MistakesPage() {
  const session = await auth(); const userId = session?.user?.id
  if (!userId) return null
  if ((await import('@/domain/e2e/state')).e2eEnabled()) { const state = (await import('@/domain/e2e/state')).getE2EState(); return <main className="workbench-page"><h1>错题本</h1><p>{state.mistakeNote ?? '暂无 Agent 建议'}</p></main> }
  const [exerciseRows, reviewRows, submissionRows] = await Promise.all([
    db.select().from(exercises),
    db.select().from(reviews).where(eq(reviews.userId, userId)).orderBy(desc(reviews.dueAt)),
    db.select().from(submissions).where(eq(submissions.userId, userId)).orderBy(desc(submissions.createdAt)),
  ])
  const relevant = exerciseRows.filter(row => submissionRows.some(item => item.exerciseId === row.id && item.status === 'failed'))
  return <main className="workbench-page"><header className="page-heading"><p className="exercise-kind">REVIEW QUEUE</p><h1>错题本</h1><p>保留失败证据，也保留你最后验证过的答案。</p></header><div className="mistake-list">{relevant.map(({ id, content }) => {
    const failed = submissionRows.find(item => item.exerciseId === id && item.status === 'failed')
    const accepted = submissionRows.find(item => item.exerciseId === id && item.status === 'passed')
    const review = selectNextPendingReview(reviewRows, id)
    return <article className="mistake-card" key={id}><header><div><span>{content.topics.join(' · ')}</span><h2>{content.title}</h2></div><Link href={`/practice/${id}`}>再练一次 →</Link></header><div className="evidence-grid"><section><h3>失败证据</h3><p>{`${failed?.testResult.failed ?? 0} 项测试未通过`}</p></section><section><h3>已验证解法</h3><pre>{accepted?.code ?? content.starterCode}</pre></section><section><h3>易错点</h3><p>根据你的失败提交与复训记录生成。</p></section><section><h3>下次复训</h3><p>{review ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium' }).format(review.dueAt) : '待安排'}</p></section></div></article>
  })}</div></main>
}
