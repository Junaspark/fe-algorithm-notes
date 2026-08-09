import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ExerciseSchema } from '@/domain/exercises/schema'
import { migrateLegacyData, STABLE_SLUGS, validateCanonicalDirectory } from '../../scripts/legacy-migration'

const source = path.join(process.cwd(), 'data.js')
const tempDestination = async () => path.join(await mkdtemp(path.join(os.tmpdir(), 'exercise-migration-')), 'exercises')

describe('legacy exercise migration', () => {
  it('builds all 19 schema-valid unique exercises at a temporary destination without mutating canonical data', async () => {
    const destination = await tempDestination()
    const canonicalBefore = await Promise.all((await readdir('exercises')).sort().map(file => readFile(path.join('exercises', file), 'utf8')))
    await migrateLegacyData({ source, destination })
    const migrated = await validateCanonicalDirectory({ source, destination })
    expect(migrated.map(item => item.id).sort()).toEqual([...STABLE_SLUGS.values()].sort())
    migrated.forEach(item => expect(ExerciseSchema.safeParse(item).success).toBe(true))
    const canonicalAfter = await Promise.all((await readdir('exercises')).sort().map(file => readFile(path.join('exercises', file), 'utf8')))
    expect(canonicalAfter).toEqual(canonicalBefore)
  })

  it('replaces an existing destination and removes a stale backup', async () => {
    const destination = await tempDestination(); await mkdir(destination); await writeFile(path.join(destination, 'old'), 'old')
    await mkdir(`${destination}.backup`); await writeFile(path.join(`${destination}.backup`, 'stale'), 'stale')
    await migrateLegacyData({ source, destination })
    expect(await readdir(destination)).toHaveLength(19)
    await expect(readdir(`${destination}.backup`)).rejects.toThrow()
  })

  it.each(['beforeSwap', 'afterSwap'] as const)('restores the original destination and cleans staging on %s failure', async failAt => {
    const destination = await tempDestination(); await mkdir(destination); await writeFile(path.join(destination, 'sentinel'), 'original')
    await expect(migrateLegacyData({ source, destination, failAt })).rejects.toThrow(`Injected ${failAt}`)
    expect(await readFile(path.join(destination, 'sentinel'), 'utf8')).toBe('original')
    const siblings = await readdir(path.dirname(destination))
    expect(siblings.filter(name => name.startsWith('exercises.staging') || name === 'exercises.backup')).toEqual([])
  })

  it('recovers a stale backup when the destination is absent before migrating', async () => {
    const destination = await tempDestination(); await mkdir(`${destination}.backup`); await writeFile(path.join(`${destination}.backup`, 'sentinel'), 'recoverable')
    await expect(migrateLegacyData({ source, destination, failAt: 'beforeSwap' })).rejects.toThrow()
    expect(await readFile(path.join(destination, 'sentinel'), 'utf8')).toBe('recoverable')
  })
})
