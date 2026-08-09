import path from 'node:path'
import { migrateLegacyData } from './legacy-migration'

async function main() {
  const root = path.resolve(import.meta.dirname, '..')
  const destination = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'exercises')
  await migrateLegacyData({ source: path.join(root, 'data.js'), destination })
  console.log(`Migrated 19 legacy exercises to ${destination}`)
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
