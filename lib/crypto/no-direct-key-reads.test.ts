import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { findDirectKeyReaders, readsKeyDirectly } from '@/scripts/lib/encryption-key-readers.mjs'

// Nothing in core reads ENCRYPTION_KEY raw: everything goes through the keyring
// (lib/crypto/keyring.ts), or a key rotation would quietly break whatever did.
// Modules are held to the same rule at rotation time, not here - their code is
// not core's to fail - by scripts/generate-module-key-readers.mjs.

const CORE_DIRS = ['app', 'lib', 'components', 'scripts', 'cactus-host', 'netlify', 'services', 'workers']

describe('direct ENCRYPTION_KEY reads', () => {
  it('core has none', () => {
    const root = process.cwd()
    const found = CORE_DIRS.flatMap((dir) =>
      findDirectKeyReaders(path.join(root, dir)).map((file) => `${dir}/${file}`),
    ).filter((file) => !file.startsWith('lib/modules/'))
    const rootFiles = ['proxy.ts', 'instrumentation.ts', 'next.config.ts'].filter((f) => {
      const file = path.join(root, f)
      return existsSync(file) && readsKeyDirectly(readFileSync(file, 'utf8'))
    })
    expect([...found, ...rootFiles]).toEqual([])
  })

  it('spots every shape of read, and not prose about one', () => {
    expect(readsKeyDirectly('const k = process.env.ENCRYPTION_KEY')).toBe(true)
    expect(readsKeyDirectly('const k = process.env?.ENCRYPTION_KEY_NEXT')).toBe(true)
    expect(readsKeyDirectly("const k = process.env['ENCRYPTION_KEY']")).toBe(true)
    expect(readsKeyDirectly('const { ENCRYPTION_KEY, SITE_URL } = process.env')).toBe(true)
    expect(readsKeyDirectly('// we used to read process.env.ENCRYPTION_KEY here')).toBe(false)
    expect(readsKeyDirectly('/* process.env.ENCRYPTION_KEY */ const x = 1')).toBe(false)
    expect(readsKeyDirectly("throw new Error('ENCRYPTION_KEY is not set')")).toBe(false)
    expect(readsKeyDirectly("const url = 'https://example.com' // process.env.ENCRYPTION_KEY")).toBe(false)
  })
})
