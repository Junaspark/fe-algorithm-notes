import React from 'react'
import { createRoot } from 'react-dom/client'
import PracticeWorkspace from '../../components/practice/PracticeWorkspace'
import { setRunnerWorkerFactory } from '../../workers/runner-client'
import type { RunRequestEnvelope, RunResultEnvelope } from '../../workers/runner.protocol'

setRunnerWorkerFactory(() => {
  const worker = { onmessage: null as ((event: MessageEvent<unknown>) => void) | null, onerror: null, terminate() {}, postMessage(message: RunRequestEnvelope) { const result: RunResultEnvelope = { kind: 'runner:result', requestId: message.request.requestId, result: { requestId: message.request.requestId, durationMs: 4, logs: [], tests: message.request.tests.map(test => ({ name: test.name, status: 'passed', durationMs: 2 })) } }; queueMicrotask(() => worker.onmessage?.(new MessageEvent('message', { data: result }))) } }
  return worker
})
window.fetch = async input => new Response(JSON.stringify(String(input).includes('submissions') ? { submissionId: 'e2e', completed: true, planCompleted: false } : { version: 2, savedAt: new Date().toISOString() }), { status: 200, headers: { 'content-type': 'application/json' } })
const test = { name: '返回预期值', args: [], expected: null }
createRoot(document.getElementById('root')!).render(<PracticeWorkspace userId="e2e-user" exercise={{ id: 'debounce', title: '防抖函数', kind: 'frontend', difficulty: 'medium', prompt: '连续触发时重置计时器，只在停止触发后执行一次。', starterCode: 'function debounce(fn, delay) {\n  // 在这里完成你的实现\n}', exportName: 'debounce', publicTests: [test], fullTests: [test, { ...test, name: '边界情况' }] }} initialDraft={{ code: 'function debounce(fn, delay) {\n  // 在这里完成你的实现\n}', version: 1 }} />)
