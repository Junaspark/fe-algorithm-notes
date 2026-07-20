import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { ExerciseSchema, type Exercise } from '@/domain/exercises/schema'

export const EXERCISE_DATA_MIGRATION = '0009_seed_exercises.sql'
const EXPECTED_EXERCISE_COUNT = 19

type MigrationOptions = {
  exercisesDirectory?: string
  migrationPath?: string
}

export async function loadCanonicalExercises(
  exercisesDirectory = path.join(process.cwd(), 'exercises'),
): Promise<Exercise[]> {
  const files = (await readdir(exercisesDirectory)).filter((file) => file.endsWith('.json')).sort()
  const exercises = await Promise.all(files.map(async (file) => (
    ExerciseSchema.parse(JSON.parse(await readFile(path.join(exercisesDirectory, file), 'utf8')))
  )))
  const ids = new Set(exercises.map((exercise) => exercise.id))

  if (exercises.length !== EXPECTED_EXERCISE_COUNT || ids.size !== EXPECTED_EXERCISE_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_EXERCISE_COUNT} canonical exercises with unique IDs`)
  }
  return exercises
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export async function generateExerciseDataMigration(options: MigrationOptions = {}): Promise<string> {
  const exercises = await loadCanonicalExercises(options.exercisesDirectory)
  const rows = exercises.map((exercise) => (
    `  (${sqlLiteral(exercise.id)}, ${sqlLiteral(exercise.kind)}::"exercise_kind", 1, ${sqlLiteral(JSON.stringify(exercise))}::jsonb)`
  ))

  return [
    '-- Generated from exercises/*.json by scripts/generate-exercise-data-migration.ts. Do not edit by hand.',
    'INSERT INTO "exercises" ("id", "kind", "version", "content")',
    'VALUES',
    rows.join(',\n'),
    'ON CONFLICT ("id") DO UPDATE SET',
    '  "kind" = EXCLUDED."kind",',
    '  "version" = EXCLUDED."version",',
    '  "content" = EXCLUDED."content",',
    '  "updated_at" = now();',
    '',
  ].join('\n')
}

export async function verifyExerciseDataMigration(options: MigrationOptions = {}): Promise<void> {
  const migrationPath = options.migrationPath ?? path.join(process.cwd(), 'drizzle', EXERCISE_DATA_MIGRATION)
  const [expected, committed] = await Promise.all([
    generateExerciseDataMigration(options),
    readFile(migrationPath, 'utf8'),
  ])
  if (committed !== expected) {
    throw new Error(`${migrationPath} does not match canonical exercise JSON`)
  }
}

async function main(): Promise<void> {
  const migrationPath = path.join(process.cwd(), 'drizzle', EXERCISE_DATA_MIGRATION)
  await writeFile(migrationPath, await generateExerciseDataMigration())
  console.log(`Generated ${migrationPath} from ${EXPECTED_EXERCISE_COUNT} canonical exercises`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
