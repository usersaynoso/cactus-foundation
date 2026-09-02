import { getSiteConfig } from '@/lib/config/site'

// The fallback when a site has never picked one, and the answer whenever a
// stored value is not a zone this runtime knows. Never throw over a setting:
// a bad zone name should cost the reader an hour, not the whole page.
export const DEFAULT_TIMEZONE = 'UTC'

export function normaliseTimezone(value: string | null | undefined): string {
  if (!value) return DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return value
  } catch {
    return DEFAULT_TIMEZONE
  }
}

// Server components render on a machine whose clock is UTC, so any date they
// format without naming a zone comes out an hour behind for half the British
// year. Everything server-rendered that shows a clock time reads this first.
export async function getSiteTimezone(): Promise<string> {
  const config = await getSiteConfig().catch(() => null)
  return normaliseTimezone(config?.timezone)
}

export function formatInSiteTimezone(
  date: Date | string | number,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    ...options,
    timeZone: normaliseTimezone(timezone),
  }).format(value)
}
