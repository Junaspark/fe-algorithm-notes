import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

import {
  EXERCISE_DATA_MIGRATION,
  generateExerciseDataMigration,
  loadCanonicalExercises,
  verifyExerciseDataMigration,
} from '@/scripts/generate-exercise-data-migration'

describe('exercise data migration', () => {
  it('is generated deterministically from exactly 19 validated canonical exercises', async () => {
    const exercises = await loadCanonicalExercises()
    const expected = await generateExerciseDataMigration()
    const committed = await readFile(path.join('drizzle', EXERCISE_DATA_MIGRATION), 'utf8')

    expect(exercises).toHaveLength(19)
    expect(new Set(exercises.map((exercise) => exercise.id)).size).toBe(19)
    expect(committed).toBe(expected)
    for (const exercise of exercises) {
      expect(committed).toContain(JSON.stringify(exercise).replaceAll("'", "''"))
    }
    expect(committed).toContain('ON CONFLICT ("id") DO UPDATE')
    expect(committed).toContain("::jsonb")
  })

  it('rejects canonical JSON drift until the committed SQL migration is regenerated', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'exercise-data-migration-'))
    const exercisesDirectory = path.join(root, 'exercises')
    const migrationPath = path.join(root, EXERCISE_DATA_MIGRATION)
    await cp('exercises', exercisesDirectory, { recursive: true })
    await writeFile(migrationPath, await generateExerciseDataMigration({ exercisesDirectory }))

    const file = path.join(exercisesDirectory, 'debounce.json')
    const changed = JSON.parse(await readFile(file, 'utf8')) as { prompt: string }
    changed.prompt = `${changed.prompt} drift`
    await writeFile(file, `${JSON.stringify(changed, null, 2)}\n`)

    await expect(verifyExerciseDataMigration({ exercisesDirectory, migrationPath })).rejects.toThrow(
      'does not match canonical exercise JSON',
    )
  })

  it('safely upserts every field as jsonb and remains idempotent', async () => {
    const client = new PGlite()
    await client.exec(`
      CREATE TYPE exercise_kind AS ENUM ('algorithm', 'frontend');
      CREATE TABLE exercises (
        id text PRIMARY KEY,
        kind exercise_kind NOT NULL,
        version integer NOT NULL DEFAULT 1,
        content jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)
    const migration = await generateExerciseDataMigration()
    await client.exec(migration)
    await client.exec(migration)

    const result = await client.query<{ id: string; kind: string; version: number; content: unknown }>(
      'SELECT id, kind, version, content FROM exercises ORDER BY id',
    )
    const canonical = (await loadCanonicalExercises()).sort((left, right) => left.id.localeCompare(right.id))

    expect(result.rows).toEqual(canonical.map((exercise) => ({
      id: exercise.id,
      kind: exercise.kind,
      version: 1,
      content: exercise,
    })))
    await client.close()
  })
})
