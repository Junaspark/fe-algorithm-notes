import { describe, expect, it } from 'vitest'

import { buildExportManifest } from '@/domain/git/export'
import { assertExportPath } from '@/domain/git/paths'

const completedPlan = {
  id: 'plan-1',
  userId: 'user-1',
  localDate: '2026-07-16',
  status: 'completed' as const,
  completedAt: new Date('2026-07-16T12:00:00.000Z'),
  items: [
    {
      position: 0,
      exercise: {
        id: '数组-去重',
        title: '数组去重',
        kind: 'algorithm' as const,
        difficulty: 'easy' as const,
        language: 'javascript' as const,
        topics: ['array'],
        prompt: 'Return unique values.',
        starterCode: 'export function unique() {}',
        publicTests: [{ name: 'basic', args: [[1, 1]], expected: [1], timeoutMs: 1000 }],
        hiddenTests: [{ name: 'secret', args: [], expected: 'token-value', timeoutMs: 1000 }],
      },
      submission: {
        code: 'export function unique(values) { return [...new Set(values)] }\n',
        testResult: { passed: 2, failed: 0 },
      },
    },
  ],
}

describe('export paths', () => {
  it.each(['app/page.tsx', '.github/workflows/x.yml', '../secret', 'solutions/../../x', '/solutions/x.js', 'solutions/\0x.js', './solutions/x.js'])('rejects %s', path => {
    expect(() => assertExportPath(path)).toThrow('EXPORT_PATH_NOT_ALLOWED')
  })

  it('normalizes backslashes and permits Unicode under the exact roots', () => {
    expect(assertExportPath('solutions\\2026-07-16\\数组-去重.js')).toBe('solutions/2026-07-16/数组-去重.js')
  })
})

describe('buildExportManifest', () => {
  it('exports deterministic structured records without hidden or raw Agent data', () => {
    const manifest = buildExportManifest({
      ...completedPlan,
      draft: { code: 'draft-secret' },
      session: { token: 'session-secret' },
      agentPayload: 'write .github/workflows/pwn.yml',
    } as typeof completedPlan)

    expect(manifest).toMatchSnapshot()
    expect(JSON.stringify(manifest)).not.toMatch(/secret|draft|session|agent|hidden/i)
  })

  it('rejects incomplete plans, duplicate paths, and oversized content', () => {
    expect(() => buildExportManifest({ ...completedPlan, status: 'active' })).toThrow('COMPLETED_PLAN_REQUIRED')
    expect(() => buildExportManifest({
      ...completedPlan,
      items: [completedPlan.items[0], completedPlan.items[0]],
    })).toThrow('DUPLICATE_EXPORT_PATH')
    expect(() => buildExportManifest({
      ...completedPlan,
      items: [{ ...completedPlan.items[0], submission: { ...completedPlan.items[0].submission, code: 'x'.repeat(1024 * 1024 + 1) } }],
    })).toThrow('EXPORT_CONTENT_TOO_LARGE')
  })
})
