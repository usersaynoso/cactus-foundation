import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { buildNetlifyToml, NETLIFY_CRON_FUNCTION, NETLIFY_TOML_PATH } from './netlify-file'
import { DISPATCH_SCHEDULE, dispatchScheduleForInterval } from './vercel-file'

describe('netlify.toml', () => {
  // Same rule as vercel.json: the tracked file is what a brand-new Netlify install
  // inherits, the builder is what updates write into an existing one.
  it('matches the file tracked in this repo, byte for byte', () => {
    const onDisk = readFileSync(join(process.cwd(), NETLIFY_TOML_PATH), 'utf8')
    expect(onDisk).toBe(buildNetlifyToml())
  })

  it('schedules the dispatcher function at the default tick', () => {
    expect(buildNetlifyToml()).toContain(`[functions."${NETLIFY_CRON_FUNCTION}"]\n  schedule = "${DISPATCH_SCHEDULE}"`)
  })

  it('carries a faster tick when a job needs one', () => {
    expect(buildNetlifyToml(dispatchScheduleForInterval(5))).toContain('schedule = "*/5 * * * *"')
  })

  it('names a function that exists', () => {
    const fn = join(process.cwd(), 'netlify', 'functions', `${NETLIFY_CRON_FUNCTION}.mts`)
    expect(existsSync(fn)).toBe(true)
  })
})
