import { signIn } from '@/auth'
import { e2eEnabled } from '@/domain/e2e/state'

export default function LoginPage() {
  if (e2eEnabled()) {
    return (
      <main>
        <h1>本地演示</h1>
        <p>以 Junaspark 身份进入仅绑定本机的练习环境。</p>
        <a href="/api/e2e/login">进入本地演示</a>
      </main>
    )
  }

  return (
    <main>
      <h1>Sign in</h1>
      <form
        action={async () => {
          'use server'
          await signIn('github', { redirectTo: '/' })
        }}
      >
        <button type="submit">Continue with GitHub</button>
      </form>
    </main>
  )
}
