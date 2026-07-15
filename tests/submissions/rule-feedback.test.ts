import { describe, expect, it } from 'vitest'

import { buildRuleFeedback } from '@/domain/submissions/rule-feedback'
import type { RunResult } from '@/workers/runner.protocol'

describe('buildRuleFeedback', () => {
  it('summarizes pass counts, failures, categories, authored hints, and learner complexity', () => {
    const result: RunResult = {
      requestId: 'run-1',
      durationMs: 42,
      logs: [],
      complexityAssessment: 'Time O(n), space O(1)',
      tests: [
        { name: 'basic', status: 'passed', durationMs: 2 },
        { name: 'empty input', status: 'failed', durationMs: 3, boundaryHint: 'Check the empty-input identity value.' },
        { name: 'hangs', status: 'timeout', durationMs: 37 },
      ],
    }

    expect(buildRuleFeedback(result)).toEqual({
      title: 'Deterministic test feedback',
      passed: 1,
      total: 3,
      summary: '1 of 3 tests passed.',
      failingTests: ['empty input', 'hangs'],
      categories: ['assertion', 'timeout'],
      boundaryHints: ['Check the empty-input identity value.'],
      complexityAssessment: 'Time O(n), space O(1)',
    })
  })

  it('classifies syntax errors without inventing boundary hints', () => {
    const feedback = buildRuleFeedback({
      requestId: 'run-2', durationMs: 1, logs: [],
      tests: [{ name: 'loads solution', status: 'error', durationMs: 1, error: 'SyntaxError: Unexpected token' }],
    })

    expect(feedback.categories).toEqual(['syntax'])
    expect(feedback.boundaryHints).toEqual([])
    expect(JSON.stringify(feedback).toLowerCase()).not.toContain('ai review')
  })
})
