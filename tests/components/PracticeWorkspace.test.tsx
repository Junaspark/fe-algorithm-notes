// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/practice/CodeEditor', () => ({ default: ({ value, onChange }: { value: string; onChange(v: string): void }) => <textarea aria-label="代码编辑器" value={value} onChange={event => onChange(event.target.value)} /> }))
vi.mock('@/workers/runner-client', () => ({ runTests: vi.fn().mockResolvedValue({ requestId: 'run-1', durationMs: 2, logs: [], tests: [{ name: 'public', status: 'passed', durationMs: 1 }] }) }))

import PracticeWorkspace from '@/components/practice/PracticeWorkspace'

const exercise = { id: 'debounce', title: '防抖', kind: 'frontend' as const, difficulty: 'easy' as const, prompt: '实现 debounce', starterCode: 'function debounce() {}', exportName: 'debounce', publicTests: [{ name: 'public', args: [], expected: null }], fullTests: [{ name: 'public', args: [], expected: null }, { name: 'hidden', args: [], expected: null }] }

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('PracticeWorkspace', () => {
  it('renders the desktop problem and editor regions together plus accessible mobile tabs', () => {
    render(<PracticeWorkspace exercise={exercise} userId="owner" initialDraft={{ code: exercise.starterCode, version: 0 }} />)
    expect(screen.getByRole('tabpanel', { name: '题目' })).toBeVisible()
    expect(screen.getByRole('tabpanel', { name: '代码' })).toBeVisible()
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['题目', '代码', '结果'])
  })

  it('autosaves two seconds after typing and offers recovery on conflict', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ code: 'DRAFT_CONFLICT', serverVersion: 4, localVersion: 0 }) }))
    render(<PracticeWorkspace exercise={exercise} userId="owner" initialDraft={{ code: exercise.starterCode, version: 0 }} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'changed' } })
    await act(async () => { vi.advanceTimersByTime(1999) })
    expect(fetch).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve() })
    expect(fetch).toHaveBeenCalledOnce()
    expect(screen.getByText('草稿版本冲突')).toBeVisible()
    expect(screen.getByRole('button', { name: '保留本地代码' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '保留本地代码' }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const retries = (fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(JSON.parse(retries.at(-1)?.[1]?.body as string)).toMatchObject({ code: 'changed', expectedVersion: 4 })
  })

  it('does not autosave unchanged code again after a successful version update', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 1 }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<PracticeWorkspace exercise={exercise} userId="owner" initialDraft={{ code: exercise.starterCode, version: 0 }} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'changed' } })
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve(); await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledOnce()
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('implements roving keyboard navigation for WAI-ARIA tabs', () => {
    render(<PracticeWorkspace exercise={exercise} userId="owner" initialDraft={{ code: exercise.starterCode, version: 0 }} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1, -1])
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[2]).toHaveFocus()
    fireEvent.keyDown(tabs[2], { key: 'Home' })
    expect(tabs[0]).toHaveFocus()
    fireEvent.keyDown(tabs[0], { key: 'End' })
    expect(tabs[2]).toHaveFocus()
    expect(tabs[2]).toHaveAttribute('aria-controls', 'results-panel')
    expect(screen.getByRole('tabpanel', { name: '结果' })).toHaveAttribute('aria-labelledby', 'results-tab')
  })

  it('runs public tests and submits only a fresh full run', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ attestation: 'signed-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ submissionId: 's1', completed: true, planCompleted: false }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<PracticeWorkspace exercise={exercise} userId="owner" initialDraft={{ code: exercise.starterCode, version: 0 }} />)
    fireEvent.click(screen.getByRole('button', { name: '运行测试' }))
    expect(await screen.findByText('1 / 1 通过')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '提交解答' }))
    expect(await screen.findByText('已通过全部测试')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith('/api/executions/attest', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/submissions', expect.objectContaining({ method: 'POST' }))
  })
})
