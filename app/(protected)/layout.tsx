import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { authorizeGitHubUser } from '@/domain/auth/authorize-github-user'

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  if (!authorizeGitHubUser({ login: session.user.githubLogin })) {
    redirect('/unauthorized')
  }

  return children
}
