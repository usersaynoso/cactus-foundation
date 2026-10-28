// Netlify scheduled function: wakes the site's cron dispatcher.
//
// Netlify's twin of the one entry in vercel.json. Its schedule is not set here but in
// netlify.toml, which Cactus rewrites when the site needs a faster or slower tick
// (lib/cron/netlify-file.ts). All it does is make the request Vercel would have made:
// GET /api/cron/dispatch with `Authorization: Bearer $CRON_SECRET`. Everything that
// decides what actually runs lives behind that route.
//
// Netlify only runs scheduled functions on the published production deploy, and
// gives them 30 seconds. The dispatcher runs in its own function invocation, so this
// one waits a little under that and then lets go; the dispatcher carries on regardless.
//
// Lives in core so every install has it. On Vercel the directory is simply ignored.

async function wakeDispatcher(): Promise<Response> {
  const base = (process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '')
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.warn('[cactus-cron] SITE_URL/URL or CRON_SECRET is not set - nothing to wake')
    return new Response('Not configured', { status: 503 })
  }

  try {
    const res = await fetch(`${base}/api/cron/dispatch`, {
      headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'cactus-netlify-cron/1' },
      signal: AbortSignal.timeout(25_000),
    })
    console.log(`[cactus-cron] dispatcher answered ${res.status}`)
    return new Response(null, { status: res.ok ? 204 : 502 })
  } catch (err) {
    // A timeout is expected on a busy tick: the dispatcher is still working, we
    // have just stopped waiting for its summary.
    console.warn('[cactus-cron] stopped waiting for the dispatcher:', err instanceof Error ? err.message : err)
    return new Response(null, { status: 202 })
  }
}

export default wakeDispatcher
