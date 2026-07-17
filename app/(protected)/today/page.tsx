import { and, asc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { dailyPlans, exercises, planItems } from '@/db/schema'

export default async function TodayPage() {
  const session = await auth(); const userId = session?.user?.id
  if (!userId) return null
  if ((await import('@/domain/e2e/state')).e2eEnabled()) {
    const state = (await import('@/domain/e2e/state')).getE2EState(); const plan = state.plan
    if (!plan) return <main className="today-empty"><p className="exercise-kind">TODAY</p><h1>今日题目正在准备</h1><p>09:30 会生成一道算法题和一道前端题。</p></main>
    return <main className="today-page"><h1>今日练习</h1>{plan.items.map(item => <Link key={item.exerciseId} href={`/practice/${item.exerciseId}`}>{state.exercises.find(x => x.id === item.exerciseId)?.content.title}</Link>)}</main>
  }
  const [plan] = await db.select().from(dailyPlans).where(and(eq(dailyPlans.userId, userId), eq(dailyPlans.status, 'active'))).limit(1)
  if (!plan) return <main className="today-empty"><p className="exercise-kind">TODAY</p><h1>今日题目正在准备</h1><p>09:30 会生成一道算法题和一道前端题。</p></main>
  const items = await db.select({ item: planItems, exercise: exercises }).from(planItems).innerJoin(exercises, eq(planItems.exerciseId, exercises.id)).where(eq(planItems.planId, plan.id)).orderBy(asc(planItems.position))
  return <main className="today-page"><p className="exercise-kind">TODAY'S SESSION · ASIA/SHANGHAI</p><h1>今日练习</h1><div className="today-list">{items.map(({ item, exercise }, index) => <Link href={`/practice/${exercise.id}`} key={exercise.id} className="today-card"><span>0{index + 1}</span><div><small>{exercise.kind.toUpperCase()}</small><h2>{exercise.content.title}</h2><p>{exercise.content.prompt}</p></div><b>{item.status === 'completed' ? '已完成' : '开始 →'}</b></Link>)}</div></main>
}
