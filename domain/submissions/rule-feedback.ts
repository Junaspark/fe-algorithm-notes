import type { RunResult } from '@/workers/runner.protocol'

export type FeedbackCategory = 'assertion' | 'syntax' | 'runtime' | 'timeout'

export type RuleFeedback = {
  title: 'Deterministic test feedback'
  passed: number
  total: number
  summary: string
  failingTests: string[]
  categories: FeedbackCategory[]
  boundaryHints: string[]
  complexityAssessment?: string
}

export function buildRuleFeedback(result: RunResult): RuleFeedback {
  const passed = result.tests.filter(test => test.status === 'passed').length
  const failing = result.tests.filter(test => test.status !== 'passed')
  const categories = new Set<FeedbackCategory>()

  for (const test of failing) {
    if (test.status === 'timeout') categories.add('timeout')
    else if (test.status === 'failed') categories.add('assertion')
    else if (/\bSyntaxError\b/.test(test.error ?? '')) categories.add('syntax')
    else categories.add('runtime')
  }

  return {
    title: 'Deterministic test feedback',
    passed,
    total: result.tests.length,
    summary: `${passed} of ${result.tests.length} tests passed.`,
    failingTests: failing.map(test => test.name),
    categories: [...categories],
    boundaryHints: [...new Set(failing.flatMap(test => test.boundaryHint ? [test.boundaryHint] : []))],
    ...(result.complexityAssessment ? { complexityAssessment: result.complexityAssessment } : {}),
  }
}
