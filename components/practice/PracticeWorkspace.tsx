'use client'

import { useCallback, useEffect, useState } from 'react'
import type { TestCase, RunResult } from '@/workers/runner.protocol'
import { runTests } from '@/workers/runner-client'
import CodeEditor from './CodeEditor'
import RuleFeedback from './RuleFeedback'
import TestResults from './TestResults'
import { flushDraftQueue, queueDraft, removeQueuedDraft, type DraftSendResult, type QueuedDraft } from './offline-drafts'

type Exercise = { id: string; title: string; kind: 'algorithm' | 'frontend'; difficulty: 'easy' | 'medium' | 'hard'; prompt: string; starterCode: string; exportName: string; publicTests: TestCase[]; fullTests: TestCase[] }
type Props = { exercise: Exercise; userId: string; initialDraft: { code: string; version: number } }
type Tab = 'problem' | 'code' | 'results'

export default function PracticeWorkspace({ exercise, userId, initialDraft }: Props) {
  const [code, setCode] = useState(initialDraft.code)
  const [version, setVersion] = useState(initialDraft.version)
  const [activeTab, setActiveTab] = useState<Tab>('problem')
  const [result, setResult] = useState<RunResult | null>(null)
  const [feedback, setFeedback] = useState<{ message?: string; tone?: 'info' | 'success' | 'warning' }>({})
  const [conflict, setConflict] = useState<{ operation: QueuedDraft; serverVersion: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [startedAt] = useState(() => Date.now())

  const sendDraft = useCallback(async (draft: QueuedDraft): Promise<DraftSendResult> => {
    const response = await fetch('/api/drafts', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) })
    if (response.status === 409) { const details = await response.json() as { serverVersion: number; localVersion: number }; setConflict({ operation: draft, serverVersion: details.serverVersion }); setFeedback({ message: '草稿版本冲突', tone: 'warning' }); return { kind: 'conflict', ...details } }
    if (!response.ok) return { kind: 'retry' }
    const saved = await response.json() as { version: number }
    setVersion(saved.version); setConflict(null); setFeedback({ message: '草稿已保存', tone: 'success' }); return { kind: 'saved', version: saved.version }
  }, [])

  useEffect(() => {
    if (code === initialDraft.code) return
    const timer = window.setTimeout(async () => {
      const operation = { key: `${userId}:${exercise.id}`, operationId: crypto.randomUUID(), exerciseId: exercise.id, code, expectedVersion: version }
      try {
        if (!navigator.onLine) { await queueDraft(operation); setFeedback({ message: '已离线保存，联网后自动同步', tone: 'info' }); return }
        const outcome = await sendDraft(operation)
        if (outcome.kind !== 'saved') await queueDraft(operation).catch(() => undefined)
      } catch { await queueDraft(operation).catch(() => undefined); setFeedback({ message: '已离线保存，联网后自动同步', tone: 'info' }) }
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [code, exercise.id, initialDraft.code, sendDraft, userId, version])

  useEffect(() => {
    const flush = () => flushDraftQueue(sendDraft).catch(() => undefined)
    window.addEventListener('online', flush); flush()
    return () => window.removeEventListener('online', flush)
  }, [sendDraft])

  const execute = async (tests: TestCase[]) => {
    const requestId = crypto.randomUUID(); setBusy(true); setActiveTab('results')
    try { const next = await runTests({ requestId, code, exportName: exercise.exportName, tests }, 3000); setResult(next); return next } finally { setBusy(false) }
  }
  const run = () => execute(exercise.publicTests)
  const submit = async () => {
    const full = await execute(exercise.fullTests)
    if (!full.tests.every(test => test.status === 'passed')) { setFeedback({ message: '尚有全量测试未通过', tone: 'warning' }); return }
    const response = await fetch('/api/submissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exerciseId: exercise.id, code, complexityAnswer: '见解题代码', elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), evidence: { scope: 'full', requestId: full.requestId, tests: full.tests.map(({ name, status }) => ({ name, status })) } }) })
    setFeedback(response.ok ? { message: '已通过全部测试', tone: 'success' } : { message: '提交未被接受，请重试', tone: 'warning' })
  }
  const selectTab = (tab: Tab) => setActiveTab(tab)
  const tabs = [['problem', '题目'], ['code', '代码'], ['results', '结果']] as const
  const navigateTabs = (event: React.KeyboardEvent<HTMLButtonElement>, tab: Tab) => {
    const index = tabs.findIndex(([id]) => id === tab); let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault(); selectTab(tabs[next][0]); document.getElementById(`${tabs[next][0]}-tab`)?.focus()
  }
  const keepLocal = async () => {
    if (!conflict) return
    const rebased = { ...conflict.operation, operationId: crypto.randomUUID(), code, expectedVersion: conflict.serverVersion }
    const result = await sendDraft(rebased)
    if (result.kind === 'saved') await removeQueuedDraft(conflict.operation).catch(() => undefined)
  }

  return <div className="practice-shell">
    <header className="practice-header"><a href="/today" className="practice-brand"><span>FE</span> Algorithm Gym</a><div><span className="save-state">版本 {version}</span><span className="session-dot" /> 今日训练</div></header>
    <nav className="mobile-tabs" role="tablist" aria-label="练习工作区">{tabs.map(([id, label]) => <button key={id} id={`${id}-tab`} role="tab" tabIndex={activeTab === id ? 0 : -1} aria-selected={activeTab === id} aria-controls={`${id}-panel`} onKeyDown={event => navigateTabs(event, id)} onClick={() => selectTab(id)}>{label}</button>)}</nav>
    <main className="practice-workspace">
      <section id="problem-panel" role="tabpanel" aria-labelledby="problem-tab" className={`problem-pane mobile-${activeTab === 'problem' ? 'active' : 'hidden'}`}><div className="problem-index">TODAY / 02</div><p className="exercise-kind">{exercise.kind === 'frontend' ? 'FRONTEND' : 'ALGORITHM'} · {exercise.difficulty.toUpperCase()}</p><h1>{exercise.title}</h1><p className="problem-copy">{exercise.prompt}</p><div className="interview-note"><b>面试笔记</b><p>先说清输入输出与边界，再实现。提交时会运行完整测试集。</p></div></section>
      <section id="code-panel" role="tabpanel" aria-labelledby="code-tab" className={`editor-pane mobile-${activeTab === 'code' ? 'active' : 'hidden'}`}><div className="pane-label"><span>solution.js</span><span>JavaScript</span></div><div className="editor-frame"><CodeEditor value={code} onChange={setCode} /></div></section>
      <aside id="results-panel" role="tabpanel" aria-labelledby="results-tab" className={`results-pane mobile-${activeTab === 'results' ? 'active' : 'hidden'}`}><div className="pane-label"><span>测试结果</span><span>{result ? `${result.durationMs}ms` : '等待运行'}</span></div><TestResults result={result} /><RuleFeedback {...feedback} />{conflict ? <button type="button" className="recovery-button" onClick={() => { void keepLocal() }}>保留本地代码</button> : null}</aside>
    </main>
    <footer className="action-bar"><span><kbd>⌘</kbd><kbd>Enter</kbd> 运行</span><div><button className="run-button" disabled={busy} onClick={run} aria-label="运行测试">{busy ? '运行中…' : '运行'}</button><button className="submit-button" disabled={busy} onClick={submit} aria-label="提交解答">提交解答 <span>→</span></button></div></footer>
  </div>
}
