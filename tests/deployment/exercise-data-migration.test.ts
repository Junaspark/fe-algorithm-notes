import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

import {
  generateNextExerciseDataMigration,
  loadCanonicalExercises,
  renderExerciseSyncMigration,
  verifyExerciseDataMigration,
} from '@/scripts/generate-exercise-data-migration'

const execMigration = async (client: PGlite, sql: string) => {
  await client.exec(sql.replaceAll('--> statement-breakpoint', ''))
}

describe('exercise data migrations', () => {
  it('keeps the already-applied 0009 baseline immutable', async () => {
    const baseline = await readFile('drizzle/0009_seed_exercises.sql')
    expect(createHash('sha256').update(baseline).digest('hex')).toBe(
      '70f55dcb83f5c67dc21604d8f63fc9749765a2080d4c49237f294973db155d28',
    )
  })

  it('has a latest monotonic sync migration covering exactly 19 canonical exercises', async () => {
    const exercises = await loadCanonicalExercises()
    await expect(verifyExerciseDataMigration()).resolves.toBe('0011_sync_exercises.sql')
    expect(exercises).toHaveLength(19)
    expect(new Set(exercises.map((exercise) => exercise.id)).size).toBe(19)
    expect(await readFile('drizzle/0011_sync_exercises.sql', 'utf8')).toBe(await renderExerciseSyncMigration())
  })

  it('creates a new migration for JSON drift without overwriting migration history', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'exercise-data-migration-'))
    const exercisesDirectory = path.join(root, 'exercises')
    const migrationDirectory = path.join(root, 'drizzle')
    await cp('exercises', exercisesDirectory, { recursive: true })
    await cp('drizzle', migrationDirectory, { recursive: true })
    const immutable = await readFile(path.join(migrationDirectory, '0011_sync_exercises.sql'), 'utf8')

    const file = path.join(exercisesDirectory, 'debounce.json')
    const changed = JSON.parse(await readFile(file, 'utf8')) as { prompt: string }
    changed.prompt = `${changed.prompt} drift`
    await writeFile(file, `${JSON.stringify(changed, null, 2)}\n`)

    await expect(verifyExerciseDataMigration({ exercisesDirectory, migrationDirectory })).rejects.toThrow(
      'does not match canonical exercise JSON',
    )
    await expect(generateNextExerciseDataMigration({ exercisesDirectory, migrationDirectory }))
      .resolves.toBe('0012_sync_exercises.sql')
    expect(await readFile(path.join(migrationDirectory, '0011_sync_exercises.sql'), 'utf8')).toBe(immutable)
    const journal = JSON.parse(await readFile(path.join(migrationDirectory, 'meta', '_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    expect(journal.entries.at(-1)?.tag).toBe('0012_sync_exercises')
    await expect(generateNextExerciseDataMigration({ exercisesDirectory, migrationDirectory })).rejects.toThrow(
      'already covers canonical exercise JSON',
    )
  })

  it('archives removed IDs while preserving foreign-key history and exactly 19 active rows', async () => {
    const client = new PGlite()
    await client.exec(`
      CREATE TYPE exercise_kind AS ENUM ('algorithm', 'frontend');
      CREATE TABLE exercises (
        id text PRIMARY KEY, kind exercise_kind NOT NULL, version integer NOT NULL DEFAULT 1,
        content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)
    await execMigration(client, await readFile('drizzle/0009_seed_exercises.sql', 'utf8'))
    await execMigration(client, await readFile('drizzle/0010_exercise_catalog_state.sql', 'utf8'))
    await client.exec('CREATE TABLE exercise_history (exercise_id text REFERENCES exercises(id)); INSERT INTO exercise_history VALUES (\'debounce\');')
    await execMigration(client, await readFile('drizzle/0011_sync_exercises.sql', 'utf8'))

    const root = await mkdtemp(path.join(os.tmpdir(), 'exercise-replacement-'))
    const exercisesDirectory = path.join(root, 'exercises')
    await cp('exercises', exercisesDirectory, { recursive: true })
    const file = path.join(exercisesDirectory, 'debounce.json')
    const replacement = JSON.parse(await readFile(file, 'utf8')) as { id: string }
    replacement.id = 'debounce-v2'
    await writeFile(file, JSON.stringify(replacement))
    await execMigration(client, await renderExerciseSyncMigration({ exercisesDirectory }))

    const counts = await client.query<{ active: number; total: number }>(
      'SELECT count(*) FILTER (WHERE active)::int AS active, count(*)::int AS total FROM exercises',
    )
    const archived = await client.query<{ active: boolean }>('SELECT active FROM exercises WHERE id = \'debounce\'')
    expect(counts.rows[0]).toEqual({ active: 19, total: 20 })
    expect(archived.rows[0]).toEqual({ active: false })
    expect((await client.query('SELECT * FROM exercise_history')).rows).toHaveLength(1)
    await client.close()
  })
})
