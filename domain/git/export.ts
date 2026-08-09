import type { Exercise } from '@/domain/exercises/schema'
import { assertExportPath } from './paths'

export const MAX_EXPORT_FILE_BYTES = 1024 * 1024
export const MAX_EXPORT_TOTAL_BYTES = 4 * 1024 * 1024

export type ExportFile = { path: string; content: string }
export type ExportManifest = { localDate: string; files: ExportFile[] }
export type CompletedPlanRecord = {
  id: string
  userId: string
  localDate: string
  status: 'active' | 'completed'
  completedAt: Date | null
  items: Array<{
    position: number
    exercise: Exercise
    submission: { code: string; testResult: { passed: number; failed: number } }
  }>
}

const bytes = (value: string) => new TextEncoder().encode(value).byteLength

const publicExercise = (exercise: Exercise) => ({
  id: exercise.id,
  title: exercise.title,
  kind: exercise.kind,
  difficulty: exercise.difficulty,
  language: exercise.language,
  topics: exercise.topics,
  prompt: exercise.prompt,
  starterCode: exercise.starterCode,
  publicTests: exercise.publicTests,
})

export function buildExportManifest(completedPlan: CompletedPlanRecord): ExportManifest {
  if (completedPlan.status !== 'completed' || !completedPlan.completedAt) throw new Error('COMPLETED_PLAN_REQUIRED')
  const files: ExportFile[] = []
  const reportLines = [`# ${completedPlan.localDate}`, '', '## Daily exercises', '']

  for (const item of [...completedPlan.items].sort((a, b) => a.position - b.position)) {
    const exercisePath = assertExportPath(`exercises/${item.exercise.id}.json`)
    const solutionPath = assertExportPath(`solutions/${completedPlan.localDate}/${item.exercise.id}.js`)
    files.push({ path: exercisePath, content: `${JSON.stringify(publicExercise(item.exercise), null, 2)}\n` })
    files.push({ path: solutionPath, content: item.submission.code.endsWith('\n') ? item.submission.code : `${item.submission.code}\n` })
    reportLines.push(
      `### ${item.exercise.title}`,
      '',
      `- Exercise: \`${item.exercise.id}\``,
      `- Kind: ${item.exercise.kind}`,
      `- Tests: ${item.submission.testResult.passed} passed, ${item.submission.testResult.failed} failed`,
      '',
    )
  }
  files.push({ path: assertExportPath(`reports/${completedPlan.localDate}.md`), content: `${reportLines.join('\n')}\n` })
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'))

  const paths = new Set<string>()
  let total = 0
  for (const file of files) {
    file.path = assertExportPath(file.path)
    if (paths.has(file.path)) throw new Error('DUPLICATE_EXPORT_PATH')
    paths.add(file.path)
    const size = bytes(file.content)
    if (size > MAX_EXPORT_FILE_BYTES) throw new Error('EXPORT_CONTENT_TOO_LARGE')
    total += size
  }
  if (total > MAX_EXPORT_TOTAL_BYTES) throw new Error('EXPORT_CONTENT_TOO_LARGE')
  return { localDate: completedPlan.localDate, files }
}
