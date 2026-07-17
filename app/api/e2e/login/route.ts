import { e2eEnabled } from '@/domain/e2e/state'

const absent = () => new Response(null, { status: 404 })

export async function GET(request: Request) {
  const url = new URL(request.url)
  const isLoopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (!e2eEnabled() || !isLoopback) return absent()

  return new Response(null, {
    status: 303,
    headers: {
      location: '/today',
      'set-cookie': 'e2e-user=Junaspark; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800',
    },
  })
}
