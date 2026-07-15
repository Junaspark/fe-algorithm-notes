import { signIn } from '@/auth'

export default function LoginPage() {
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
