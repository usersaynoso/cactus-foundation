import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({
  exists: vi.fn(), executablePath: vi.fn(), args: ['--serverless'],
}))
vi.mock('fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(), existsSync: mocks.exists,
}))
vi.mock('@sparticuz/chromium-min', () => ({ default: {
  executablePath: mocks.executablePath, args: mocks.args,
} }))
import { resolvePrintBrowser } from './chromium'

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('print browser selection', () => {
  it('uses the configured external executable locally without searching project files', async () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '')
    vi.stubEnv('CHROME_PATH', '/custom/chrome')
    expect((await resolvePrintBrowser())?.executablePath).toBe('/custom/chrome')
    expect(mocks.exists).not.toHaveBeenCalled()
    expect(mocks.executablePath).not.toHaveBeenCalled()
  })

  it('keeps local discovery in preference order, including Linux installations', async () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '')
    vi.stubEnv('CHROME_PATH', '')
    mocks.exists.mockImplementation((file: string) => file === '/usr/bin/google-chrome')
    expect((await resolvePrintBrowser())?.executablePath).toBe('/usr/bin/google-chrome')
    expect(mocks.exists.mock.calls.map((args) => args[0])).toEqual([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome',
    ])
  })

  it('returns null when a local browser is unavailable', async () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '')
    vi.stubEnv('CHROME_PATH', '')
    mocks.exists.mockReturnValue(false)
    expect(await resolvePrintBrowser()).toBeNull()
  })

  it('keeps deployed Chromium resolution and never probes local paths', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('CHROMIUM_PACK_URL', 'https://storage.example/browser.tar')
    mocks.executablePath.mockResolvedValue('/tmp/chromium')
    expect(await resolvePrintBrowser()).toEqual({ executablePath: '/tmp/chromium', args: ['--serverless'] })
    expect(mocks.executablePath).toHaveBeenCalledWith('https://storage.example/browser.tar')
    expect(mocks.exists).not.toHaveBeenCalled()
  })

  it('excludes external executable probes from Turbopack asset tracing', () => {
    const source = readFileSync(new URL('./chromium.ts', import.meta.url), 'utf8')
    expect(source).toContain('existsSync(/* turbopackIgnore: true */ candidate)')
  })
})
