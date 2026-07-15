import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ExerciseSchema } from '@/domain/exercises/schema'

const fixture = require('../fixtures/legacy-data.js') as {
  count: number
  slugs: string[]
  preservedFields: string[]
}

describe('legacy exercise migration', () => {
  it('writes 19 schema-valid exercises with stable slugs and all source fields', () => {
    execFileSync(process.execPath, ['scripts/migrate-legacy-data.mjs'], { cwd: process.cwd() })

    const files = readdirSync('exercises').filter((file) => file.endsWith('.json')).sort()
    expect(files).toHaveLength(fixture.count)
    expect(files.map((file) => path.basename(file, '.json')).sort()).toEqual([...fixture.slugs].sort())

    for (const file of files) {
      const raw = JSON.parse(readFileSync(path.join('exercises', file), 'utf8'))
      const parsed = ExerciseSchema.parse(raw)
      expect(parsed.id).toBe(path.basename(file, '.json'))
      for (const field of fixture.preservedFields) {
        expect(parsed.legacy).toHaveProperty(field)
      }
    }
  })
})
