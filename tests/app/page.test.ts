import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect }))

describe('home page', () => {
  beforeEach(() => redirect.mockClear())

  it('sends product traffic to the daily exercise page', async () => {
    const { default: Home } = await import('@/app/page')
    Home()
    expect(redirect).toHaveBeenCalledWith('/today')
  })
})
