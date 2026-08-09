import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { authorizeGitHubUser } from '@/domain/auth/authorize-github-user'

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!authorizeGitHubUser({ login: session.user.githubLogin })) {
    redirect('/unauthorized')
  }

  return <div className="product-shell">
    <header className="product-nav"><Link href="/today" className="product-mark">FE / GYM</Link><nav aria-label="主导航"><Link href="/today">今日</Link><Link href="/library">题库</Link><Link href="/mistakes">错题</Link><Link href="/progress">成长</Link></nav></header>
    {children}
  </div>
}
