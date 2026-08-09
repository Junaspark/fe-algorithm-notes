import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { prepareNetlifyMigrations, verifyNetlifyMigrationParity } from '@/scripts/prepare-netlify-migrations'

describe('prepareNetlifyMigrations', () => {
  it('uses Netlify-safe positive, contiguous migration versions matching the Drizzle journal', async () => {
    const names = (await readdir('drizzle')).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()
    const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }

    expect(names.map((name) => Number(name.slice(0, 4)))).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    )
    expect(journal.entries.map(({ idx }) => idx)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1))
    expect(journal.entries.map(({ tag }) => `${tag}.sql`)).toEqual(names)
  })

  it('copies every canonical SQL migration in lexical order and removes stale output', async () => {
    const destination = await mkdtemp(path.join(os.tmpdir(), 'netlify-migrations-'))
    await writeFile(path.join(destination, 'stale.sql'), 'stale')

    const names = await prepareNetlifyMigrations({ destination })

    expect(names).toEqual(
      (await readdir('drizzle'))
        .filter((name) => /^\d{4}_.+\.sql$/.test(name))
        .sort(),
    )
    expect(await readdir(destination)).toEqual(names)
    for (const name of names) {
      expect(await readFile(path.join(destination, name), 'utf8')).toBe(
        await readFile(path.join('drizzle', name), 'utf8'),
      )
    }
  })

  it('rejects an empty canonical migration source', async () => {
    const source = await mkdtemp(path.join(os.tmpdir(), 'empty-migrations-'))
    const destination = await mkdtemp(path.join(os.tmpdir(), 'netlify-migrations-'))

    await expect(prepareNetlifyMigrations({ source, destination })).rejects.toThrow(
      'No canonical SQL migrations found',
    )
  })

  it('rejects version zero and non-contiguous canonical migrations', async () => {
    const source = await mkdtemp(path.join(os.tmpdir(), 'invalid-migrations-'))
    const destination = await mkdtemp(path.join(os.tmpdir(), 'netlify-migrations-'))
    await writeFile(path.join(source, '0000_invalid.sql'), 'invalid')
    await expect(prepareNetlifyMigrations({ source, destination })).rejects.toThrow(
      'positive and contiguous from 0001',
    )
  })

  it('keeps the checked-in Netlify migration snapshots byte-for-byte identical', async () => {
    await expect(verifyNetlifyMigrationParity()).resolves.toEqual(
      (await readdir('drizzle'))
        .filter((name) => /^\d{4}_.+\.sql$/.test(name))
        .sort(),
    )
  })

  it('rejects missing, stale, and changed checked-in migration snapshots', async () => {
    const source = await mkdtemp(path.join(os.tmpdir(), 'canonical-migrations-'))
    const destination = await mkdtemp(path.join(os.tmpdir(), 'checked-in-migrations-'))
    await writeFile(path.join(source, '0001_first.sql'), 'canonical')

    await expect(verifyNetlifyMigrationParity({ source, destination })).rejects.toThrow('missing')

    await writeFile(path.join(destination, '0001_first.sql'), 'canonical')
    await writeFile(path.join(destination, '9999_stale.sql'), 'stale')
    await expect(verifyNetlifyMigrationParity({ source, destination })).rejects.toThrow('stale')

    await rm(path.join(destination, '9999_stale.sql'))
    await writeFile(path.join(destination, '0001_first.sql'), 'changed')
    await expect(verifyNetlifyMigrationParity({ source, destination })).rejects.toThrow('differs')
  })

  it('makes CI reject changed and untracked regenerated snapshots', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8')
    expect(workflow).toContain('git diff --exit-code -- drizzle netlify/database/migrations')
    expect(workflow).toContain('git status --porcelain --untracked-files=all -- drizzle netlify/database/migrations')
  })
})
