import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`)
  }),
}))

vi.mock('@/auth', () => ({ auth }))
vi.mock('next/navigation', () => ({ redirect }))

import ProtectedLayout from '@/app/(protected)/layout'

describe('protected layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects an absent session to login', async () => {
    auth.mockResolvedValue(null)

    await expect(ProtectedLayout({ children: 'private' as ReactNode })).rejects.toThrow('redirect:/login')
  })

  it('redirects a session without the allowed GitHub login to unauthorized', async () => {
    auth.mockResolvedValue({ user: { githubLogin: 'someone-else' } })

    await expect(ProtectedLayout({ children: 'private' as ReactNode })).rejects.toThrow('redirect:/unauthorized')
  })

  it('renders protected content only for the normalized allowed GitHub login', async () => {
    auth.mockResolvedValue({ user: { githubLogin: '  JUNASPARK  ' } })

    const rendered = await ProtectedLayout({ children: 'private' as ReactNode })
    expect((rendered.props as { children: ReactNode[] }).children[1]).toBe('private')
    expect(redirect).not.toHaveBeenCalled()
  })
})
