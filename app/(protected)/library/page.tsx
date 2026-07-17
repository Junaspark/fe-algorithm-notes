import { and, eq } from 'drizzle-orm'
import Link from 'next/link'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { exercises, reviews, submissions } from '@/db/schema'

type Search = { q?: string; kind?: string; difficulty?: string; status?: string; topic?: string; weak?: string }

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null
  const e2e = process.env.E2E_COMPILED === '1' && process.env.E2E_TEST_MODE === '1'
  const [search, rows, submissionRows, reviewRows] = e2e ? [await searchParams, (await import('@/domain/e2e/state')).getE2EState().exercises.map(x => ({ ...x, version: 1, createdAt: new Date(), updatedAt: new Date() })), [], []] as never : await Promise.all([
    searchParams,
    db.select().from(exercises),
    db.select({ exerciseId: submissions.exerciseId, status: submissions.status }).from(submissions).where(eq(submissions.userId, userId)).limit(2000),
    db.select({ exerciseId: reviews.exerciseId }).from(reviews).where(and(eq(reviews.userId, userId), eq(reviews.status, 'pending'))).limit(500),
  ])
  const passed = new Set(submissionRows.filter(row => row.status === 'passed').map(row => row.exerciseId))
  const weakExerciseIds = new Set([
    ...submissionRows.filter(row => row.status === 'failed').map(row => row.exerciseId),
    ...reviewRows.map(row => row.exerciseId),
  ])
  const weakTopics = new Set(rows.filter(row => weakExerciseIds.has(row.id)).flatMap(row => row.content.topics))
  const query = search.q?.trim().toLocaleLowerCase('zh-CN') ?? ''
  const filtered = rows.filter(({ content, kind, id }) => {
    const complete = passed.has(id)
    return (!query || [content.title, content.prompt, id, ...content.topics].join(' ').toLocaleLowerCase('zh-CN').includes(query))
      && (!search.kind || kind === search.kind)
      && (!search.difficulty || content.difficulty === search.difficulty)
      && (!search.status || (search.status === 'completed') === complete)
      && (!search.topic || content.topics.includes(search.topic))
      && (search.weak !== '1' || content.topics.some(topic => weakTopics.has(topic)))
  })
  const topics = [...new Set(rows.flatMap(row => row.content.topics))].sort()

  return <main className="workbench-page"><header className="page-heading"><p className="exercise-kind">LIBRARY · {rows.length} EXERCISES</p><h1>题库</h1><p>用题型、难度和薄弱知识点快速收窄练习范围。</p></header>
    <form className="filter-rail"><input name="q" defaultValue={search.q} placeholder="搜索 19 道题" aria-label="搜索题库"/><select name="kind" defaultValue={search.kind ?? ''} aria-label="题型"><option value="">全部题型</option><option value="algorithm">算法</option><option value="frontend">前端手写</option></select><select name="difficulty" defaultValue={search.difficulty ?? ''} aria-label="难度"><option value="">全部难度</option><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select><select name="status" defaultValue={search.status ?? ''} aria-label="状态"><option value="">全部状态</option><option value="completed">已通过</option><option value="pending">待练习</option></select><select name="topic" defaultValue={search.topic ?? ''} aria-label="知识点"><option value="">全部知识点</option>{topics.map(topic => <option key={topic}>{topic}</option>)}</select><label className="weak-toggle"><input type="checkbox" name="weak" value="1" defaultChecked={search.weak === '1'}/>仅薄弱点</label><button type="submit">筛选</button></form>
    <p className="result-count">找到 {filtered.length} 道题</p><div className="library-grid">{filtered.map(({ id, kind, content }) => <Link href={`/practice/${id}`} className="library-card" key={id}><div><span>{kind === 'algorithm' ? 'ALGORITHM' : 'FRONTEND'}</span><b>{passed.has(id) ? '已通过' : '待练习'}</b></div><h2>{content.title}</h2><p>{content.prompt}</p><footer><span>{content.difficulty.toUpperCase()}</span>{content.topics.map(topic => <span key={topic}>#{topic}</span>)}</footer></Link>)}</div>
  </main>
}
