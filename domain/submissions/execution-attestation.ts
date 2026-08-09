type Binding = { userId: string; exerciseId: string; code: string; suiteVersion: string }
type Payload = { v: 1; nonce: string; userId: string; exerciseId: string; codeHash: string; suiteVersion: string; passed: true; exp: number }

const encoder = new TextEncoder()
const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
const normalizeCode = (code: string) => code.replace(/\r\n?/g, '\n').normalize('NFC')
const digest = async (value: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
export const normalizedCodeHash = (code: string) => digest(normalizeCode(code))
const key = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

export async function createExecutionAttestation(binding: Binding, options: { secret: string; now?: Date; nonce?: string; ttlSeconds?: number }) {
  if (options.secret.length < 32) throw new Error('EXECUTION_ATTESTATION_SECRET_TOO_SHORT')
  const now = options.now ?? new Date()
  const payload: Payload = { v: 1, nonce: options.nonce ?? crypto.randomUUID(), userId: binding.userId, exerciseId: binding.exerciseId, codeHash: await digest(normalizeCode(binding.code)), suiteVersion: binding.suiteVersion, passed: true, exp: Math.floor(now.getTime() / 1000) + (options.ttlSeconds ?? 120) }
  const encoded = base64url(encoder.encode(JSON.stringify(payload)))
  const signature = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await key(options.secret), encoder.encode(encoded))))
  return `${encoded}.${signature}`
}

export async function verifyExecutionAttestation(token: string, binding: Binding, options: { secret: string; now?: Date }): Promise<Payload> {
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra) throw new Error('EXECUTION_ATTESTATION_INVALID')
  const valid = await crypto.subtle.verify('HMAC', await key(options.secret), Buffer.from(signature, 'base64url'), encoder.encode(encoded)).catch(() => false)
  if (!valid) throw new Error('EXECUTION_ATTESTATION_INVALID')
  let payload: Payload
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Payload } catch { throw new Error('EXECUTION_ATTESTATION_INVALID') }
  if (payload.v !== 1 || payload.passed !== true || payload.userId !== binding.userId || payload.exerciseId !== binding.exerciseId || payload.suiteVersion !== binding.suiteVersion || payload.codeHash !== await digest(normalizeCode(binding.code))) throw new Error('EXECUTION_ATTESTATION_BINDING_MISMATCH')
  if (payload.exp < Math.floor((options.now ?? new Date()).getTime() / 1000)) throw new Error('EXECUTION_ATTESTATION_EXPIRED')
  return payload
}
