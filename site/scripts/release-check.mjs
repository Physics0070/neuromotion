// Gate for a public build: every human sign-off in src/release.json must be present.
// ALLOW_UNREVIEWED=1 builds a pilot anyway. Nothing on the pages says so; the Clinical review page still lists what is pending.
import { readFile } from 'node:fs/promises'
import { pending } from '../src/release.ts'

const r = JSON.parse(await readFile(new URL('../src/release.json', import.meta.url), 'utf8'))
const missing = pending(r)
if (missing.length === 0) console.log('release check: all sign-offs present')
else if (process.env.ALLOW_UNREVIEWED === '1') console.warn(`release check: PILOT BUILD, still pending: ${missing.join('; ')}`)
else {
  console.error('release check FAILED. Still needed before a public release (edit src/release.json):')
  for (const m of missing) console.error(`  - ${m}`)
  process.exit(1)
}
