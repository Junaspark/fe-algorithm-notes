import type { RunResult } from '@/workers/runner.protocol'

export default function TestResults({ result }: { result: RunResult | null }) {
  if (!result) return <div className="empty-results"><span aria-hidden>◎</span><p>运行代码后，测试结果会出现在这里。</p></div>
  const passed = result.tests.filter(test => test.status === 'passed').length
  return <div className="test-results"><strong>{passed} / {result.tests.length} 通过</strong><ul>{result.tests.map(test => <li key={test.name} data-status={test.status}><span>{test.status === 'passed' ? '✓' : '×'}</span>{test.name}<small>{test.durationMs}ms</small>{test.error ? <code>{test.error}</code> : null}</li>)}</ul></div>
}
