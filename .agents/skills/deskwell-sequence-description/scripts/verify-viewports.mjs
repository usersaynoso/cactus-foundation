// Verify feature-video description blocks on the live site at three viewports.
// Usage:
//   node verify-viewports.mjs <productUrl> [count]
// count defaults to every <video> the description renders.
// Needs playwright beside it (not a repo dependency):
//   npm i playwright && npx playwright install chromium-headless-shell webkit
// Writes d-<i>.png, t-<i>.png and m-<i>.png next to itself.
// LOOK AT THEM - numbers alone have missed a defect before now.

import { chromium, webkit, devices } from 'playwright'

const URL_ARG = process.argv[2]
const COUNT_ARG = process.argv[3] ? Number(process.argv[3]) : null
if (!URL_ARG) { console.error('usage: node verify-viewports.mjs <productUrl> [count]'); process.exit(1) }
const OUT = new URL('.', import.meta.url).pathname

// deskwell.co.uk never reaches networkidle (polling widgets), so settle by time.
// Smooth scrolling is disabled too: scrollTo would otherwise animate, and every
// measurement below would read the position the page is leaving rather than the
// one it is going to.
// The consent banner is hidden, never clicked: a screenshot tool has no business
// answering a consent question on the user's behalf, and hiding it is enough.
// It cannot be matched on class or id - Deskwell's is a bare <div> with NEITHER,
// so the obvious `[class*=cookie i],[id*=cookie i]` selector sails straight past
// it and it eats ~135px off the bottom of every screenshot. Match on what it is
// (pinned, tall, against the bottom edge) and what it says instead.
const hideConsent = (p) => p.evaluate(`(() => {
  let n = 0
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
    const r = el.getBoundingClientRect()
    if (r.height < 40 || r.bottom < innerHeight - 40) continue
    if (!/cookie|consent/i.test(el.textContent || '')) continue
    el.style.setProperty('display', 'none', 'important'); n++
  }
  return n
})()`).catch(() => 0)

const load = async (p) => {
  await p.goto(URL_ARG, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3500)
  await hideConsent(p)
  await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' }).catch(() => {})
}

const countVideos = (p) => p.evaluate('document.querySelectorAll("video").length')

// Centre the block in the viewport, which is also where its play observer fires.
const centre = (p, i) => p.evaluate(`(() => {
  const v = document.querySelectorAll('video')[${i}]
  if (!v) return -1
  const r = v.getBoundingClientRect()
  window.scrollTo(0, r.top + scrollY - (innerHeight - r.height) / 2)
  return 1
})()`)

// Walk up from the video to the row that holds it and its copy, so this works
// whatever the surrounding markup is.
const MEASURE = (i) => `(() => {
  const v = document.querySelectorAll('video')[${i}]
  if (!v) return null
  let row = v.parentElement
  while (row && !(row.matches && row.matches('[data-fv-split]'))) row = row.parentElement
  // Stacked (or captionless) blocks keep video and copy in one wrapper, so the
  // wrapper is the scope - never the grandparent, which would borrow the NEXT
  // section's heading and report a wide clip as titled when it isn't.
  const scope = row ?? v.parentElement ?? document.body
  const h2 = scope.querySelector('h2')
  const c = v.getBoundingClientRect()
  const t = h2 ? (h2.parentElement ?? h2).getBoundingClientRect() : null
  const cs = getComputedStyle(v)
  return {
    title: h2 ? h2.textContent.trim() : null,
    vh: innerHeight,
    beside: !!row,
    video: { top: Math.round(c.top), bottom: Math.round(c.bottom), left: Math.round(c.left), width: Math.round(c.width) },
    text: t ? { top: Math.round(t.top), bottom: Math.round(t.bottom), left: Math.round(t.left), width: Math.round(t.width) } : null,
    rowWidth: row ? Math.round(row.getBoundingClientRect().width) : null,
    radius: cs.borderTopLeftRadius,
    paused: v.paused,
    currentTime: Number(v.currentTime.toFixed(2)),
    readyState: v.readyState,
  }
})()`

async function run(label, launcher, contextOpts, prefix, mobile) {
  const b = await launcher.launch()
  const ctx = await b.newContext(contextOpts)
  const p = await ctx.newPage()
  await load(p)
  const total = COUNT_ARG ?? await countVideos(p)
  if (!total) { console.log(`${label}: no video blocks found`); await b.close(); return }
  for (let i = 0; i < total; i++) {
    if ((await centre(p, i)) < 0) { console.log(`${label} #${i}: not found`); continue }
    // Long enough for the play observer to fire and a frame or two to run, so
    // "is it actually playing" is a real answer rather than a guess.
    await p.waitForTimeout(2500)
    const m = await p.evaluate(MEASURE(i))
    await p.screenshot({ path: `${OUT}${prefix}-${i}.png` })
    if (!m) { console.log(`${label} #${i}: could not measure`); continue }
    const midDiff = m.text ? Math.abs((m.text.top + m.text.bottom) / 2 - (m.video.top + m.video.bottom) / 2) : null
    const bits = [
      `${label} #${i} ${JSON.stringify(m.title)}`,
      m.paused ? 'PAUSED' : `playing (t=${m.currentTime}s)`,
      `radius ${m.radius}`,
    ]
    if (!m.text) {
      // A captionless block is the full-width opening video: there is no column
      // to fit inside and no copy to sit above, so the two-column checks would
      // only cry wolf.
      bits.push('full width, no copy')
    } else if (mobile) {
      bits.push(m.text.bottom <= m.video.top + 2 ? 'TEXT ABOVE VIDEO' : 'OVERLAP')
      bits.push(m.video.bottom - m.video.top <= m.vh ? 'FITS SCREEN' : 'TALLER THAN SCREEN')
    } else {
      bits.push(m.text.left > m.video.left ? 'text RIGHT of video' : 'text LEFT of video')
      bits.push(midDiff === null ? '' : (midDiff <= 20 ? 'LEVEL' : `OFF by ${Math.round(midDiff)}px`))
      bits.push(m.rowWidth && m.video.width <= m.rowWidth / 2 + 8 ? 'FITS COLUMN' : 'TOO WIDE')
    }
    console.log(bits.filter(Boolean).join(' | '))
  }
  await b.close()
}

await run('DESKTOP', chromium, { viewport: { width: 1440, height: 900 } }, 'd', false)
await run('TABLET', chromium, { viewport: { width: 820, height: 1180 } }, 't', false)
await run('MOBILE', webkit, { ...devices['iPhone 13'] }, 'm', true)
console.log('done - now LOOK at the screenshots')
