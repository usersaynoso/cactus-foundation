// Verify a sequence-with-text product description on the live site at three
// viewports. Usage:
//   node verify-viewports.mjs <productUrl> [chromePx]
// chromePx defaults to 158 (Deskwell header 96 + product tab bar 62).
// Needs playwright beside it:
//   npm i playwright && npx playwright install chromium-headless-shell webkit
// Writes d-pinned.png, t-pinned.png, m-prepin.png, m-pinned.png next to itself.
// LOOK AT THEM - numbers alone have missed a defect before now.

import { chromium, webkit, devices } from 'playwright'

const URL_ARG = process.argv[2]
const CHROME_PX = Number(process.argv[3] ?? 158)
if (!URL_ARG) { console.error('usage: node verify-viewports.mjs <productUrl> [chromePx]'); process.exit(1) }
const S = new URL('.', import.meta.url).pathname

// deskwell.co.uk never reaches networkidle (polling widgets), so settle by time.
const load = async (p) => {
  await p.goto(URL_ARG, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(3500)
  await p.addStyleTag({ content: '[class*=cookie i],[id*=cookie i],[class*=consent i],[id*=consent i]{display:none!important}' }).catch(() => {})
}

// Walk up from the canvas to the sticky stage and its tall spacer, so this
// works whatever the surrounding markup is.
const LOCATE = `(() => {
  const cv = document.querySelector('canvas[role="img"], canvas')
  if (!cv) return null
  let sticky = cv.parentElement
  while (sticky && getComputedStyle(sticky).position !== 'sticky') sticky = sticky.parentElement
  if (!sticky) return null
  return { sticky, spacer: sticky.parentElement, cv }
})()`

// Mid-pin is computed from live heights, so it holds at any scroll length.
const scrollToMidPin = (p) => p.evaluate(`(() => {
  const found = ${LOCATE}
  if (!found) return -1
  const { sticky, spacer } = found
  const spTop = spacer.getBoundingClientRect().top + scrollY
  const range = spacer.getBoundingClientRect().height - sticky.getBoundingClientRect().height
  window.scrollTo(0, spTop + Math.max(50, range / 2))
  return 1
})()`)

const MEASURE = `(() => {
  const found = ${LOCATE}
  if (!found) return null
  const { cv, sticky } = found
  const h2 = sticky.querySelector('h2')
  const c = cv.getBoundingClientRect()
  const t = h2 ? (h2.parentElement ?? h2).getBoundingClientRect() : null
  // Opacity of the shared faded element both live inside.
  let fadeEl = cv.parentElement
  while (fadeEl && fadeEl !== sticky && getComputedStyle(fadeEl).transition.indexOf('opacity') === -1) fadeEl = fadeEl.parentElement
  return {
    vh: innerHeight,
    canvas: { top: Math.round(c.top), bottom: Math.round(c.bottom), left: Math.round(c.left), width: Math.round(c.width) },
    text: t ? { top: Math.round(t.top), bottom: Math.round(t.bottom), left: Math.round(t.left), width: Math.round(t.width) } : null,
    textSharesFade: !!(fadeEl && h2 && fadeEl.contains(h2)),
    stageWidth: Math.round(sticky.getBoundingClientRect().width),
    fadeOpacity: fadeEl ? getComputedStyle(fadeEl).opacity : null,
  }
})()`

async function wide(label, viewport, shot) {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport })
  await load(p)
  if ((await scrollToMidPin(p)) < 0) { console.log(`${label}: sequence not found`); await b.close(); return }
  await p.waitForTimeout(1800)
  await scrollToMidPin(p) // re-aim: lazy content above may have shifted the page
  await p.waitForTimeout(1500)
  const m = await p.evaluate(MEASURE)
  await p.screenshot({ path: S + shot })
  if (!m) { console.log(`${label}: could not measure`); await b.close(); return }
  const midDiff = m.text ? Math.abs((m.text.top + m.text.bottom) / 2 - (m.canvas.top + m.canvas.bottom) / 2) : null
  console.log(`${label}:`, JSON.stringify({ canvas: m.canvas, text: m.text, vh: m.vh }),
    '|', m.canvas.top >= CHROME_PX ? 'CANVAS CLEAR' : 'CANVAS BEHIND BAR',
    '|', m.text ? (m.text.left > m.canvas.left ? 'text RIGHT of animation' : 'text LEFT of animation') : 'no text',
    '|', midDiff === null ? '' : (midDiff <= 20 ? 'LEVEL' : `OFF by ${Math.round(midDiff)}px`),
    '|', m.canvas.width <= m.stageWidth / 2 + 8 ? 'FITS ITS COLUMN' : 'TOO WIDE',
    '|', m.textSharesFade ? 'text fades with animation' : 'TEXT OUTSIDE FADE')
  await b.close()
}

await wide('DESKTOP', { width: 1440, height: 900 }, 'd-pinned.png')
await wide('TABLET', { width: 820, height: 1180 }, 't-pinned.png')

// Mobile: stacked. Pre-pin must be gapless; pinned must fit one screen.
{
  const b = await webkit.launch()
  const ctx = await b.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage()
  await load(p)
  const spacerTop = await p.evaluate(`(() => {
    const found = ${LOCATE}
    if (!found) return -1
    return found.spacer.getBoundingClientRect().top + scrollY
  })()`)
  if (spacerTop < 0) { console.log('MOBILE: sequence not found') }
  else {
    await p.evaluate((t) => window.scrollTo(0, t - innerHeight * 0.55), spacerTop)
    await p.waitForTimeout(1200)
    const gap = await p.evaluate(`(() => {
      const found = ${LOCATE}
      const h2 = found.sticky.querySelector('h2')
      if (!h2) return null
      return Math.round(h2.getBoundingClientRect().top - found.spacer.getBoundingClientRect().top)
    })()`)
    await p.screenshot({ path: S + 'm-prepin.png' })
    await scrollToMidPin(p)
    await p.waitForTimeout(1500)
    const m = await p.evaluate(MEASURE)
    await p.screenshot({ path: S + 'm-pinned.png' })
    console.log('MOBILE prePin gap:', gap, 'px (want ~0) |',
      JSON.stringify({ text: m.text, canvas: m.canvas, vh: m.vh }),
      '|', m.text && m.text.bottom <= m.canvas.top + 2 ? 'TEXT ABOVE ANIMATION' : 'OVERLAP',
      '|', m.text && m.text.top >= CHROME_PX ? 'TEXT CLEAR' : 'TEXT BEHIND BAR',
      '|', m.canvas.bottom <= m.vh ? 'FITS SCREEN' : 'OVERFLOWS',
      '|', m.textSharesFade ? 'text fades with animation' : 'TEXT OUTSIDE FADE')
  }
  await b.close()
}
console.log('done - now LOOK at the four screenshots')
