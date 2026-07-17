import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { exercises, reviews, submissions } from '@/db/schema'

export default async function MistakesPage() {
  const session = await auth(); const userId = session?.user?.id
  if (!userId) return null
  const [exerciseRows, reviewRows, submissionRows] = await Promise.all([
    db.select().from(exercises),
    db.select().from(reviews).where(eq(reviews.userId, userId)).orderBy(desc(reviews.dueAt)),
    db.select().from(submissions).where(eq(submissions.userId, userId)).orderBy(desc(submissions.createdAt)),
  ])
  const relevant = exerciseRows.filter(row => row.content.legacy?.mistakes.length || submissionRows.some(item => item.exerciseId === row.id && item.status === 'failed'))
  return <main className="workbench-page"><header className="page-heading"><p className="exercise-kind">REVIEW QUEUE</p><h1>错题本</h1><p>保留失败证据，也保留你最后验证过的答案。</p></header><div className="mistake-list">{relevant.map(({ id, content }) => {
    const failed = submissionRows.find(item => item.exerciseId === id && item.status === 'failed')
    const accepted = submissionRows.find(item => item.exerciseId === id && item.status === 'passed')
    const review = reviewRows.find(item => item.exerciseId === id && item.status === 'pending')
    return <article className="mistake-card" key={id}><header><div><span>{content.topics.join(' · ')}</span><h2>{content.title}</h2></div><Link href={`/practice/${id}`}>再练一次 →</Link></header><div className="evidence-grid"><section><h3>失败证据</h3><p>{failed ? `${failed.testResult.failed} 项测试未通过` : '来自旧版练习记录'}</p></section><section><h3>已验证解法</h3><pre>{accepted?.code ?? content.starterCode}</pre></section><section><h3>易错点</h3><ul>{content.legacy?.mistakes.map(note => <li key={note}>{note}</li>)}</ul></section><section><h3>下次复训</h3><p>{review ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium' }).format(review.dueAt) : '待安排'}</p></section></div></article>
  })}</div></main>
}
