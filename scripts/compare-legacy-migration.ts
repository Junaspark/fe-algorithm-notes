import path from 'node:path'
import { validateCanonicalDirectory } from './legacy-migration'

async function main() {
  const root = path.resolve(import.meta.dirname, '..')
  await validateCanonicalDirectory({ source: path.join(root, 'data.js'), destination: path.join(root, 'exercises') })
  console.log('Migration comparison passed: schema, unique IDs, stable slugs, exact normalized legacy fields, and behavior readiness')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
