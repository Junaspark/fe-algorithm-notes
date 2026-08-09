// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

const run = vi.fn()
vi.mock('@/components/practice/monaco-local', () => ({}))
vi.mock('next/dynamic', () => ({ default: () => (props: { onMount?(editor: unknown, api: unknown): void }) => {
  props.onMount?.(
    { getAction: () => ({ run }), getModel: () => ({ uri: 'test://model' }) },
    { languages: { typescript: { getJavaScriptWorker: async () => async () => ({}) } } },
  )
  return <div aria-label="Monaco test editor" />
} }))

import CodeEditor from '@/components/practice/CodeEditor'

it('formats the document on demand through Monaco', () => {
  render(<CodeEditor value="const x=1" onChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '格式化代码' }))
  expect(run).toHaveBeenCalledOnce()
})
