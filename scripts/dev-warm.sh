#!/usr/bin/env bash
# dev-warm.sh: Start a clean dev server and pre-warm key routes before you open
# the browser.
#
# Why: Turbopack compiles routes lazily. Each new route changes the shared entry
# chunk list hash. When a browser tab refreshes, it tells the HMR server "I'm
# subscribed to the old hash", gets back {type:"notFound"}, and calls
# location.reload() — creating a cascade of ChunkLoadErrors. Pre-warming all
# route groups up-front stabilises the chunk list so refreshes are clean.
#
# Usage: npm run dev:warm
#        PORT=4000 npm run dev:warm
set -euo pipefail

PORT="${PORT:-3000}"
export PORT

listeners() { lsof -ti "tcp:${PORT}" 2>/dev/null || true; }

# ── Kill existing server ──────────────────────────────────────────────────────
pids="$(listeners)"
if [ -n "$pids" ]; then
  # shellcheck disable=SC2086
  echo "→ Stopping dev server on :${PORT} (PID(s): $(echo $pids))…"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  for _ in $(seq 1 20); do
    [ -z "$(listeners)" ] && break
    sleep 0.5
  done
  remaining="$(listeners)"
  if [ -n "$remaining" ]; then
    echo "→ Still alive, force-killing PID(s): ${remaining}"
    # shellcheck disable=SC2086
    kill -9 $remaining 2>/dev/null || true
    for _ in $(seq 1 10); do
      [ -z "$(listeners)" ] && break
      sleep 0.5
    done
  fi
  if [ -n "$(listeners)" ]; then
    echo "✗ Port ${PORT} is still in use — not starting a second server." >&2
    exit 1
  fi
  echo "✓ Port ${PORT} is free."
else
  echo "→ No existing dev server on :${PORT}."
fi

# ── Clear .next ───────────────────────────────────────────────────────────────
# A clean build directory means Turbopack starts from a single compilation
# context with no stale chunk variants from previous sessions.
echo "→ Clearing .next cache…"
rm -rf .next

# ── Background pre-warmer ─────────────────────────────────────────────────────
# This subshell runs concurrently with the dev server. It waits until the server
# is accepting requests, then hits each route group so Turbopack compiles all
# layouts and page handlers before any browser tab connects.
(
  # Wait up to 90s for the server to be ready.
  ready=0
  for i in $(seq 1 90); do
    if curl -sf "http://localhost:${PORT}/" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done

  if [ "$ready" -eq 0 ]; then
    echo ""
    echo "⚠  Pre-warmer timed out waiting for server — skipping route warm-up."
    exit 0
  fi

  echo ""
  echo "→ Pre-warming routes (stabilising Turbopack chunk graph)…"

  # One URL per route group is enough to trigger compilation of that handler.
  # The [slug] pattern only needs one hit regardless of which slug you use.
  # Include every route group the browser might navigate to so Turbopack
  # compiles them all before any browser HMR subscription arrives.
  ROUTES=(
    "/"              # root public page + shared public layout
    "/home"          # [slug] dynamic page handler
    "/logged-out"    # named public route
    "/setup"         # setup wizard (different middleware path)
    "/style-guide"   # style-guide route group (triggers global-error chunk)
    "/privacy-policy" # another named public route
  )

  for route in "${ROUTES[@]}"; do
    code=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:${PORT}${route}" 2>/dev/null || echo "err")
    echo "  ${route}: HTTP ${code}"
  done

  # Allow Turbopack to finish any background compilation triggered above.
  # 10 s gives the Rust compiler time to flush all deferred chunks.
  sleep 10
  echo "✓ Warm-up done — safe to open http://localhost:${PORT} in your browser."
) &

# ── Start dev server in foreground ───────────────────────────────────────────
# exec replaces this shell so the terminal stays attached to Next.js output.
echo "→ Starting fresh dev server on :${PORT}…"
exec npm run dev
