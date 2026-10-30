import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// cactus-host is run by Node straight from its .ts files, with no build step. That
// only works while every file sticks to TypeScript Node can strip (no enums, no
// parameter properties, `import type` for types) - none of which tsc or the tests
// above would notice, because they run through a bundler that forgives all of it.
// Loading the real entry point under plain Node is the check that does notice.
describe('cactus-host under plain Node', () => {
  it('loads every module and prints its usage', () => {
    const main = fileURLToPath(new URL('./main.ts', import.meta.url))
    const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', main, '--help'], {
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('cactus-host site add')
  })
})
