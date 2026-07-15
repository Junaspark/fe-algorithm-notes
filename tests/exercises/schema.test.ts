import { describe, expect, it } from 'vitest'
import { ExerciseSchema } from '@/domain/exercises/schema'

describe('ExerciseSchema', () => {
  it('requires JavaScript tests and interview metadata', () => {
    const result = ExerciseSchema.safeParse({ id: 'promise-all', language: 'javascript' })
    expect(result.success).toBe(false)
  })

  it('accepts a complete algorithm exercise', () => {
    expect(ExerciseSchema.parse({
      id: 'unique-array', title: '数组去重', kind: 'algorithm', difficulty: 'easy',
      language: 'javascript', topics: ['array'], prompt: '实现 uniqueArray',
      starterCode: 'function uniqueArray(values) {}',
      publicTests: [{ name: 'deduplicates', args: [[1, 1, 2]], expected: [1, 2] }],
      hiddenTests: [], legacy: { status: '已通过', complexity: 'O(n)', mistakes: [], questions: [] },
    }).id).toBe('unique-array')
  })

  it('preserves additional legacy fields during validation', () => {
    const exercise = ExerciseSchema.parse({
      id: 'unique-array', title: '数组去重', kind: 'algorithm', difficulty: 'easy',
      language: 'javascript', topics: ['array'], prompt: '实现 uniqueArray', starterCode: '',
      publicTests: [{ name: 'legacy case', args: [], expected: null }], hiddenTests: [],
      legacy: {
        status: '已通过', complexity: 'O(n)', mistakes: [], questions: [],
        summary: '使用 Set', code: 'const uniqueArray = arr => [...new Set(arr)]',
      },
    })

    expect(exercise.legacy).toMatchObject({ summary: '使用 Set', code: expect.any(String) })
  })
})
