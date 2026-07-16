import React from 'react'
import { createRoot } from 'react-dom/client'
import PracticeWorkspace from '../../components/practice/PracticeWorkspace'

const test = { name: '返回 42', args: [], expected: 42 }
createRoot(document.getElementById('root')!).render(<PracticeWorkspace userId="e2e-user" exercise={{ id: 'answer', title: '返回答案', kind: 'algorithm', difficulty: 'medium', prompt: '实现 answer 并返回 42。', starterCode: 'function answer() {\n  return 0\n}', exportName: 'answer', publicTests: [test], fullTests: [test, { ...test, name: '隐藏用例' }] }} initialDraft={{ code: 'function answer() {\n  return 0\n}', version: 1 }} />)
