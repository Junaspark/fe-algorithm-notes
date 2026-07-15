import { describe, expect, it } from 'vitest'

import { normalizeJsonValue } from '@/workers/runner.protocol'

describe('normalizeJsonValue', () => {
  it('preserves prototype-sensitive keys as own enumerable clone-safe data', () => {
    const source = JSON.parse('{"__proto__":{"polluted":true},"constructor":"ctor","prototype":"proto"}')

    const normalized = normalizeJsonValue(source) as Record<string, unknown>
    const cloned = structuredClone(normalized)

    expect(Object.keys(normalized)).toEqual(['__proto__', 'constructor', 'prototype'])
    expect(Object.prototype.hasOwnProperty.call(normalized, '__proto__')).toBe(true)
    expect(normalized.__proto__).toEqual({ polluted: true })
    expect(normalized.constructor).toBe('ctor')
    expect(normalized.prototype).toBe('proto')
    expect(Object.keys(cloned)).toEqual(['__proto__', 'constructor', 'prototype'])
    expect(cloned.__proto__).toEqual({ polluted: true })
  })
})
