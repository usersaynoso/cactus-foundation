#!/usr/bin/env node
import { writeFile } from 'fs/promises'
import { join } from 'path'

const METADATA_URL = 'https://fonts.google.com/metadata/fonts'
const dest = join(process.cwd(), 'lib/design/google-fonts.json')

async function run() {
  console.log(`[fetch-google-fonts] Fetching ${METADATA_URL}`)
  const res = await fetch(METADATA_URL)
  if (!res.ok) {
    console.error(`[fetch-google-fonts] Request failed: ${res.status} ${res.statusText}`)
    process.exit(1)
  }

  const data = await res.json()
  const families = (data.familyMetadataList ?? [])
    .slice()
    .sort((a, b) => (a.popularity ?? Infinity) - (b.popularity ?? Infinity))
    .map((f) => f.family)

  if (families.length === 0) {
    console.error('[fetch-google-fonts] No families found in response — aborting write.')
    process.exit(1)
  }

  await writeFile(dest, JSON.stringify(families), 'utf8')
  console.log(`[fetch-google-fonts] Written ${families.length} font families to lib/design/google-fonts.json`)
}

run().catch((err) => {
  console.error('[fetch-google-fonts] Fatal error:', err.message)
  process.exit(1)
})
