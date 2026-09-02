#!/usr/bin/env node
/**
 * `next build` with a watchdog.
 *
 * The build step is the one part of a deploy with no supervision: Vercel starts it
 * and, if it never finishes, kills the whole deployment at the 45-minute limit with
 * nothing in the log after "Creating an optimized production build ...". That is
 * exactly what happened on 2026-09-02 - the first deploy after the build machine was
 * dropped to 4 cores / 8 GB. Next 16.2's Turbopack held the entire module graph in
 * memory and went over the 8 GB ceiling; instead of failing it thrashed, printed
 * nothing for 45 minutes, and the site did not update. The real fix for that was the
 * upgrade to Next 16.3 (which cut Turbopack's memory use dramatically and made the
 * build filesystem cache a supported default). This wrapper is the safety net for
 * the next time something in the bundler stalls, whatever the cause:
 *
 *   - A build that has printed nothing for SILENT_LIMIT is not "slow", it is stuck.
 *     Kill it, throw away the Turbopack cache (the usual suspect, and a build killed
 *     mid-snapshot can leave a corrupt one behind), and try once more cold.
 *   - A build still going after TOTAL_LIMIT gets the same treatment, so a crawl is
 *     caught as well as a freeze.
 *   - The retry runs with the cache off, so it is a genuinely different attempt
 *     rather than a repeat of the one that just failed.
 *
 * Both limits are chosen against Vercel's 45-minute deployment budget: a first
 * attempt can burn TOTAL_LIMIT and the retry still has room to finish a cold build
 * (~2 minutes at the time of writing) several times over. Failing loudly at 25
 * minutes beats being killed silently at 45 either way.
 *
 * Armed on Vercel and in CI only - killing a developer's local build because they
 * stepped away from the keyboard would be its own bug. Set CACTUS_BUILD_WATCHDOG=1
 * to arm it locally, or =0 to disarm it anywhere.
 */

import { spawn } from 'child_process'
import { existsSync, rmSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const MINUTE = 60_000
const minutesFromEnv = (name, fallback) => {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw * MINUTE : fallback * MINUTE
}
// No output at all for this long means stuck, not slow. Turbopack prints nothing
// between "Creating an optimized production build" and "Compiled successfully", so
// this has to clear the longest legitimate cold compile by a wide margin.
const SILENT_LIMIT = minutesFromEnv('CACTUS_BUILD_SILENT_LIMIT_MINUTES', 10)
// Total wall clock for one attempt, output or not.
const TOTAL_LIMIT = minutesFromEnv('CACTUS_BUILD_TOTAL_LIMIT_MINUTES', 25)

const watchdogArmed = process.env.CACTUS_BUILD_WATCHDOG === '1'
  || (process.env.CACTUS_BUILD_WATCHDOG !== '0'
    && (process.env.VERCEL === '1' || process.env.CI === '1' || process.env.CI === 'true'))

// Call the locally installed Next CLI directly rather than through npx, which re-runs
// npm's package resolution for no benefit (mirrors build-migrate.mjs and prebuild.mjs).
const localNext = path.join(rootDir, 'node_modules', '.bin', 'next')
const nextCli = existsSync(localNext) ? [localNext] : ['npx', 'next']

// Passed straight through, so `npm run build -- --debug` still reaches next build.
const passthroughArgs = process.argv.slice(2)

const since = (start) => `${((Date.now() - start) / 1000).toFixed(1)}s`

/**
 * One `next build`. Resolves { status, retryable } - `retryable` marks a run that
 * failed for a reason a second, colder attempt could survive (the watchdog killed
 * it, or the kernel did), which is the only outcome the caller retries.
 */
function runBuild(env, attempt) {
  return new Promise((resolve) => {
    const start = Date.now()
    let lastOutput = start
    let stalled = false
    let killedByUs = false
    let settled = false

    const child = spawn(nextCli[0], [...nextCli.slice(1), 'build', ...passthroughArgs], {
      cwd: rootDir,
      env,
      // Piped rather than inherited so the watchdog can see that output is still
      // arriving. Every chunk is forwarded the moment it lands, so the deployment
      // log still streams exactly as it did when this was `next build` directly.
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      // Its own process group, so a stalled build can be killed whole. next build
      // spawns workers of its own; signalling only the direct child would leave
      // them alive, still holding the memory the retry needs.
      detached: true,
    })

    const forward = (stream, out) => {
      stream.on('data', (chunk) => {
        lastOutput = Date.now()
        out.write(chunk)
      })
    }
    forward(child.stdout, process.stdout)
    forward(child.stderr, process.stderr)

    // SIGTERM first so Turbopack can put its files down, SIGKILL if it will not go.
    // Negative pid signals the whole group; the fallback covers a platform where
    // process groups are not a thing (Windows) or a child that has already gone.
    const signal = (sig) => {
      try { process.kill(-child.pid, sig) } catch { try { child.kill(sig) } catch {} }
    }
    const kill = () => {
      killedByUs = true
      signal('SIGTERM')
      setTimeout(() => signal('SIGKILL'), 10_000).unref()
    }

    // The child is in its own process group, so a Ctrl-C in a terminal reaches this
    // wrapper and not the build. Pass it on, or `next build` would be left running
    // after the thing that started it has gone. Marked as our own kill, so the
    // resulting signal death is not mistaken for an OOM and retried: somebody who
    // just interrupted the build does not want it started again.
    const forwardSignal = (sig) => () => { killedByUs = true; signal(sig) }
    const onInt = forwardSignal('SIGINT')
    const onTerm = forwardSignal('SIGTERM')
    process.on('SIGINT', onInt)
    process.on('SIGTERM', onTerm)

    const timer = setInterval(() => {
      if (settled) return
      const silentFor = Date.now() - lastOutput
      const runningFor = Date.now() - start
      const mins = (ms) => `${(ms / MINUTE).toFixed(1)} minutes`
      const reason = silentFor >= SILENT_LIMIT
        ? `no output for ${mins(silentFor)}`
        : runningFor >= TOTAL_LIMIT
          ? `still running after ${mins(runningFor)}`
          : null
      if (!reason) return
      stalled = true
      console.error(`\n[next-build] Attempt ${attempt} is stuck - ${reason}. Killing it.`)
      clearInterval(timer)
      kill()
    }, 30_000)
    timer.unref()

    const settle = (status, retryable = stalled) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      process.off('SIGINT', onInt)
      process.off('SIGTERM', onTerm)
      resolve({ status, retryable, elapsed: since(start) })
    }

    child.on('error', (err) => {
      console.error(`[next-build] Could not run next build: ${err.message}`)
      settle(1)
    })
    // `close` reports status null when the child died from a signal - our own kill,
    // or an OOM kill by the kernel. Either way that is a failure, not a success, so
    // it must never become exit code 0. A signal we did not send is the kernel
    // reclaiming the memory the build asked for, which is the same class of problem
    // as a stall and gets the same cold retry.
    child.on('close', (status, signal) => {
      const oomKilled = status === null && signal != null && !killedByUs
      if (oomKilled) {
        console.error(`\n[next-build] Attempt ${attempt} was killed with ${signal} - out of memory on this machine.`)
      }
      settle(status ?? 1, stalled || oomKilled)
    })
  })
}

// Everything Turbopack may have cached, including a snapshot a killed build could
// have left half-written. Removed before the retry so it starts genuinely cold.
function clearTurbopackCache() {
  for (const dir of ['cache/turbopack', 'dev/cache/turbopack']) {
    const full = path.join(rootDir, '.next', dir)
    try {
      rmSync(full, { recursive: true, force: true })
    } catch (err) {
      console.warn(`[next-build] Could not clear ${dir}: ${err.message}`)
    }
  }
}

if (!watchdogArmed) {
  console.log('[next-build] Watchdog off (not Vercel or CI) - running next build unsupervised.')
} else {
  console.log(
    `[next-build] Watchdog armed: kill after ${SILENT_LIMIT / MINUTE} min with no output, `
    + `or ${TOTAL_LIMIT / MINUTE} min in total.`
  )
}

async function main() {
  const first = await runBuild(process.env, 1)

  if (first.status === 0) {
    console.log(`[next-build] next build finished in ${first.elapsed}.`)
    return 0
  }

  // A build that failed on its own merits (a bundler error, a bad import) fails the
  // deploy now. Retrying it would only burn another attempt to print the same error.
  if (!first.retryable || !watchdogArmed) return first.status

  console.error(
    '[next-build] Retrying once with the Turbopack build cache disabled '
    + '(CACTUS_TURBOPACK_BUILD_CACHE=0). If this retry is what gets the deploy out, set '
    + 'that variable in the project\'s environment variables so the next build skips '
    + 'straight to it, and see next.config.ts.'
  )
  clearTurbopackCache()

  const second = await runBuild({ ...process.env, CACTUS_TURBOPACK_BUILD_CACHE: '0' }, 2)

  if (second.status === 0) {
    console.log(`[next-build] next build finished in ${second.elapsed} on the second attempt.`)
    return 0
  }
  if (second.retryable) {
    console.error(
      '[next-build] The retry went the same way. This is not the Turbopack cache - the '
      + 'build itself cannot finish on this machine. Raise the build machine size, or '
      + 'bisect with CACTUS_BUILD_TOTAL_LIMIT_MINUTES set higher to get a longer log out '
      + 'of it.'
    )
  }
  return second.status
}

// Sets the exit code and lets the process end on its own rather than calling
// process.exit(), which can drop whatever has not yet flushed down a pipe - and on
// Vercel every line of this log goes down a pipe. The lines at risk are the last
// ones, which are the ones worth reading when a build has just failed.
process.exitCode = await main()
