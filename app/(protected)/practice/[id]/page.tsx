import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import PracticeWorkspace from '@/components/practice/PracticeWorkspace'
import { db } from '@/db/client'
import { drafts, exercises } from '@/db/schema'
import { normalizeJsonValue, type TestCase } from '@/workers/runner.protocol'

const runnerTests = (tests: Array<{ name: string; args: unknown[]; expected: unknown; scenario?: TestCase['scenario'] }>): TestCase[] => tests.map((test, index) => ({
  name: test.name,
  args: test.args.map((arg, argument) => normalizeJsonValue(arg, `tests[${index}].args[${argument}]`)),
  expected: normalizeJsonValue(test.expected, `tests[${index}].expected`),
  scenario: test.scenario,
}))

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, auth()])
  const userId = session?.user?.id
  if (!userId) return null
  const [exercise] = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1)
  if (!exercise) notFound()
  const [draft] = await db.select().from(drafts).where(and(eq(drafts.userId, userId), eq(drafts.exerciseId, id))).limit(1)
  const content = exercise.content
  const exportName = content.starterCode.match(/(?:function|class)\s+([\w$]+)/)?.[1]
    ?? content.starterCode.match(/(?:const|let|var)\s+([\w$]+)\s*=/)?.[1] ?? id.replaceAll('-', '')
  const publicTests = runnerTests(content.publicTests)
  return <PracticeWorkspace userId={userId} exercise={{ id, title: content.title, kind: content.kind, difficulty: content.difficulty, prompt: content.prompt, starterCode: content.starterCode, exportName, evaluationMode: content.evaluation?.mode ?? 'function', publicTests, fullTests: [...publicTests, ...runnerTests(content.hiddenTests)] }} initialDraft={{ code: draft?.code ?? content.starterCode, version: draft?.version ?? 0 }} />
}
