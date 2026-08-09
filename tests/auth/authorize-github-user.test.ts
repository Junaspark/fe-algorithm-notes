import { expect, it } from 'vitest'

import { authorizeGitHubUser } from '@/domain/auth/authorize-github-user'

it('allows only Junaspark case-insensitively', () => {
  expect(authorizeGitHubUser({ login: 'Junaspark' })).toBe(true)
  expect(authorizeGitHubUser({ login: 'junaspark' })).toBe(true)
  expect(authorizeGitHubUser({ login: '  JUNASPARK  ' })).toBe(true)
  expect(authorizeGitHubUser({ login: 'other' })).toBe(false)
  expect(authorizeGitHubUser({ login: undefined })).toBe(false)
})

it('never authorizes from a display name or email', () => {
  expect(authorizeGitHubUser({ login: null, name: 'Junaspark', email: 'junaspark@example.com' })).toBe(false)
})
