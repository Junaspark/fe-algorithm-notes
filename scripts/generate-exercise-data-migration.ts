import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { ExerciseSchema, type Exercise } from '@/domain/exercises/schema'

export const EXERCISE_BASELINE_MIGRATION = '0010_seed_exercises.sql'
export const EXERCISE_SYNC_MIGRATION_PATTERN = /^\d{4}_sync_exercises\.sql$/
const EXPECTED_EXERCISE_COUNT = 19

type MigrationOptions = { exercisesDirectory?: string; migrationDirectory?: string }

export async function loadCanonicalExercises(
  exercisesDirectory = path.join(process.cwd(), 'exercises'),
): Promise<Exercise[]> {
  const files = (await readdir(exercisesDirectory)).filter((file) => file.endsWith('.json')).sort()
  const exercises = await Promise.all(files.map(async (file) => (
    ExerciseSchema.parse(JSON.parse(await readFile(path.join(exercisesDirectory, file), 'utf8')))
  )))
  if (exercises.length !== EXPECTED_EXERCISE_COUNT
    || new Set(exercises.map((exercise) => exercise.id)).size !== EXPECTED_EXERCISE_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_EXERCISE_COUNT} canonical exercises with unique IDs`)
  }
  return exercises
}

const sqlLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`

export async function renderExerciseSyncMigration(options: MigrationOptions = {}): Promise<string> {
  const exercises = await loadCanonicalExercises(options.exercisesDirectory)
  const rows = exercises.map((exercise) => (
    `  (${sqlLiteral(exercise.id)}, ${sqlLiteral(exercise.kind)}::"exercise_kind", 1, ${sqlLiteral(JSON.stringify(exercise))}::jsonb, true)`
  ))
  return [
    '-- Generated from exercises/*.json by scripts/generate-exercise-data-migration.ts. Do not edit by hand.',
    '-- Non-canonical rows remain for foreign-key history but are excluded from the active catalog.',
    'WITH "canonical" AS (',
    'INSERT INTO "exercises" ("id", "kind", "version", "content", "active")',
    'VALUES', rows.join(',\n'),
    'ON CONFLICT ("id") DO UPDATE SET',
    '  "kind" = EXCLUDED."kind",',
    '  "version" = EXCLUDED."version",',
    '  "content" = EXCLUDED."content",',
    '  "active" = true,',
    '  "updated_at" = now()',
    'RETURNING "id"',
    ')',
    'UPDATE "exercises" SET "active" = false',
    'WHERE "active" = true AND "id" NOT IN (SELECT "id" FROM "canonical");',
    '',
  ].join('\n')
}

async function migrationNames(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()
}

export async function latestExerciseSyncMigration(options: MigrationOptions = {}): Promise<string> {
  const directory = options.migrationDirectory ?? path.join(process.cwd(), 'drizzle')
  const latest = (await migrationNames(directory)).filter((name) => EXERCISE_SYNC_MIGRATION_PATTERN.test(name)).at(-1)
  if (!latest) throw new Error('No exercise sync migration exists')
  return latest
}

export async function verifyExerciseDataMigration(options: MigrationOptions = {}): Promise<string> {
  const directory = options.migrationDirectory ?? path.join(process.cwd(), 'drizzle')
  const latest = await latestExerciseSyncMigration(options)
  const [expected, committed] = await Promise.all([
    renderExerciseSyncMigration(options),
    readFile(path.join(directory, latest), 'utf8'),
  ])
  if (committed !== expected) throw new Error(`${latest} does not match canonical exercise JSON`)
  return latest
}

export async function generateNextExerciseDataMigration(options: MigrationOptions = {}): Promise<string> {
  const directory = options.migrationDirectory ?? path.join(process.cwd(), 'drizzle')
  try {
    await verifyExerciseDataMigration(options)
    throw new Error('Latest exercise sync migration already covers canonical exercise JSON')
  } catch (error) {
    if (error instanceof Error && error.message.includes('already covers')) throw error
    if (!(error instanceof Error)
      || (!error.message.includes('does not match canonical exercise JSON')
        && !error.message.includes('No exercise sync migration exists'))) throw error
  }
  const names = await migrationNames(directory)
  const next = String(Math.max(...names.map((name) => Number(name.slice(0, 4)))) + 1).padStart(4, '0')
  const name = `${next}_sync_exercises.sql`
  const migrationPath = path.join(directory, name)
  await writeFile(migrationPath, await renderExerciseSyncMigration(options), { flag: 'wx' })
  try {
    const journalPath = path.join(directory, 'meta', '_journal.json')
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      version: string
      entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>
    }
    journal.entries.push({
      idx: Math.max(...journal.entries.map((entry) => entry.idx)) + 1,
      version: journal.version,
      when: Date.now(),
      tag: name.slice(0, -4),
      breakpoints: true,
    })
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`)
  } catch (error) {
    await rm(migrationPath, { force: true })
    throw error
  }
  return name
}

async function main(): Promise<void> {
  console.log(`Generated ${await generateNextExerciseDataMigration()}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
