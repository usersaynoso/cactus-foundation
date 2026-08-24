import { describe, it, expect, vi } from 'vitest'
import { cronJobsFromManifest, CORE_CRON_JOBS } from './jobs'
import { isValidCronExpression } from './schedule'

describe('cronJobsFromManifest', () => {
  it('reads a well-formed manifest', () => {
    expect(cronJobsFromManifest('shop', {
      cronJobs: [
        { path: '/api/m/shop/cron/low-stock-alerts', schedule: '0 7 * * *' },
        { path: '/api/m/shop/cron/reconcile-refunds', schedule: '30 6 * * *' },
      ],
    })).toEqual([
      { path: '/api/m/shop/cron/low-stock-alerts', schedule: '0 7 * * *', module: 'shop' },
      { path: '/api/m/shop/cron/reconcile-refunds', schedule: '30 6 * * *', module: 'shop' },
    ])
  })

  it('is quiet about a manifest with nothing to schedule', () => {
    expect(cronJobsFromManifest('search', null)).toEqual([])
    expect(cronJobsFromManifest('search', {})).toEqual([])
    expect(cronJobsFromManifest('search', { cronJobs: 'nightly' })).toEqual([])
  })

  it('refuses a path outside the module, so a manifest cannot borrow CRON_SECRET', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(cronJobsFromManifest('search', {
      cronJobs: [
        { path: '/api/admin/backup/export', schedule: '0 3 * * *' },
        { path: '/api/m/other-module/cron/run', schedule: '0 3 * * *' },
        { path: '/api/m/search/cron/reindex', schedule: '0 4 * * *' },
      ],
    })).toEqual([{ path: '/api/m/search/cron/reindex', schedule: '0 4 * * *', module: 'search' }])
    warn.mockRestore()
  })

  it('drops an entry it could not schedule rather than pretending it is scheduled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(cronJobsFromManifest('boards', {
      cronJobs: [
        { path: '/api/m/boards/cron/digest' },
        { schedule: '0 7 * * *' },
        { path: '/api/m/boards/cron/digest', schedule: '0 7 * * MON' },
      ],
    })).toEqual([])
    warn.mockRestore()
  })
})

describe('CORE_CRON_JOBS', () => {
  it('every core schedule is one the dispatcher can actually evaluate', () => {
    for (const job of CORE_CRON_JOBS) expect(isValidCronExpression(job.schedule)).toBe(true)
  })

  it('has no duplicate paths - the path is the job identity in CronRun', () => {
    const paths = CORE_CRON_JOBS.map((j) => j.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
