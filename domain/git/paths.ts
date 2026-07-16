import path from 'node:path'

const EXPORT_ROOTS = new Set(['exercises', 'solutions', 'reports'])

export function assertExportPath(candidate: string): string {
  if (!candidate || candidate.includes('\0') || path.posix.isAbsolute(candidate) || path.win32.isAbsolute(candidate)) {
    throw new Error('EXPORT_PATH_NOT_ALLOWED')
  }
  const slashPath = candidate.replaceAll('\\', '/')
  const rawSegments = slashPath.split('/')
  if (rawSegments.some(segment => segment === '..') || rawSegments[0]?.startsWith('.')) {
    throw new Error('EXPORT_PATH_NOT_ALLOWED')
  }
  const normalized = path.posix.normalize(slashPath)
  const segments = normalized.split('/')
  if (segments.length < 2 || !EXPORT_ROOTS.has(segments[0]) || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('EXPORT_PATH_NOT_ALLOWED')
  }
  return normalized
}
