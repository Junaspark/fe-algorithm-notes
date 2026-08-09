import { createHash, timingSafeEqual } from 'node:crypto'

export function isAuthorizedCronRequest(request: Request, secret: string): boolean {
  if (secret.length === 0) return false
  const actual = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(actual), digest(expected))
}
