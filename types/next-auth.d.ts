import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      githubLogin: string
    }
  }

  interface User {
    githubLogin: string
  }
}

declare module '@auth/core/adapters' {
  interface AdapterUser {
    githubLogin: string
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    githubLogin?: string
  }
}
