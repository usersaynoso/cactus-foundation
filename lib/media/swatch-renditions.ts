// A picture swatch is kept in up to three sizes, and this works out what to say
// about each of them.
//
// Client-safe on purpose: nothing in here imports sharp or prisma, so an admin
// screen can explain a value's renditions without dragging the resizer into the
// browser bundle. The resizer itself is lib/media/renditions.ts.
//
// In core rather than in a module because three modules already keep swatches -
// product attributes, shop variations and shop filters - and a module may not
// import another module's code. One set of numbers, one set of words, so the
// three screens cannot tell an owner three different stories.

// The longest edge of each shrunk copy.
//
// SMALL is sized for the biggest thing a shrunk copy is ever drawn at: the 200px
// hover preview on the product page's option picker, at a 2x display.
//
// TINY is sized for everything else, which is dots: an 18px chip on a category
// card, a 14px dot in a filter list, a 56px tile in a picture-swatch filter -
// 112px at 2x, so 128 covers the lot with a little room. A 400px copy of a
// fabric photograph weighs about 50 KB and a category page draws two dozen of
// them, which is a megabyte of bandwidth to paint some dots.
export const SWATCH_SMALL_MAX_PX = 400
export const SWATCH_TINY_MAX_PX = 128

// The weight under which a shrunk copy would save nothing worth having, so none
// is made and the renderer falls back to the bigger file it already has.
export const SWATCH_RENDITION_WORTHWHILE_BYTES = 100_000

// What the media library knows about one picture's file. A url with no entry in
// the screen's map is one the library has never heard of - an external host, or
// a site-relative path - which is shown as an unknown size rather than as zero.
export type SwatchFileInfo = {
  bytes: number
  width: number | null
  height: number | null
}

// Which of the three a given box is.
export type SwatchRendition = 'full' | 'small' | 'tiny'

export type SwatchRenditionVerdict =
  // No picture on the value at all.
  | 'no-picture'
  // This copy exists.
  | 'has-copy'
  // No copy, and none is wanted: the full picture is under both caps.
  | 'small-enough'
  // No copy; the full picture is light but has never been measured, so whether
  // one would be made cannot be promised either way.
  | 'maybe-small-enough'
  // No copy and the full picture is over a cap, so one is worth making.
  | 'wants-copy'
  // The picture is not a library item, so there are no bytes to shrink.
  | 'not-in-library'

export type SwatchRenditionBox = {
  rendition: SwatchRendition
  verdict: SwatchRenditionVerdict
  // The url this box draws, or null when there is nothing to draw.
  url: string | null
  // The first line of the tooltip: what this box IS.
  title: string
  // The rest of it: the file's facts, what draws it, and what to do about it.
  detail: string
  // Whether any storefront surface is currently drawing this one.
  inUse: boolean
}

export type SwatchRenditionNotes = {
  boxes: [SwatchRenditionBox, SwatchRenditionBox, SwatchRenditionBox]
  // Which rendition the product page's option picker draws.
  usedOnProductPage: SwatchRendition
  // Which rendition category cards and filter dots draw.
  usedOnListings: SwatchRendition
}

// KB and MB rather than kB and MiB: this is a figure an owner compares against
// what their phone says a photo weighs, not a specification.
export function formatSwatchFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// "312 KB, 2000 x 2000" where the library has measured it, weight alone where it
// has not, and an honest shrug where it has never seen the file.
export function describeSwatchFile(info: SwatchFileInfo | undefined): string {
  if (!info) return 'size unknown, not in the media library'
  const size = formatSwatchFileSize(info.bytes)
  if (info.width && info.height) return `${size}, ${info.width} x ${info.height}`
  return size
}

// What draws each copy, named the way an owner would name it. Used both as a
// sentence ("Drawn by ...") and as the subject of one ("... use the full picture
// instead"), so it is written as a noun phrase and never as a clause.
const SUBJECT: Record<SwatchRendition, string> = {
  full: '3D models, and anywhere the picture is shown at full size',
  small: "the product page's option swatches, and the big preview on hovering one",
  tiny: 'category cards and filter lists, for their dots and little tiles',
}

const TITLES: Record<SwatchRendition, string> = {
  full: 'Full picture',
  small: 'Small copy',
  tiny: 'Tiny copy',
}

const CAPS: Record<Exclude<SwatchRendition, 'full'>, number> = {
  small: SWATCH_SMALL_MAX_PX,
  tiny: SWATCH_TINY_MAX_PX,
}

const PICK = 'Click to change it, or drop an image here.'
const MAKE = 'Press "Make copies" above to make one.'

function judge(
  rendition: SwatchRendition,
  swatch: string | null,
  copy: string | null,
  fullInfo: SwatchFileInfo | undefined,
): SwatchRenditionVerdict {
  if (!swatch) return 'no-picture'
  // The full picture is the one the owner chose, so it is never absent while
  // there is a swatch at all, and never a candidate for shrinking.
  if (rendition === 'full') return 'has-copy'
  if (copy) return 'has-copy'
  if (!fullInfo) return 'not-in-library'
  const cap = CAPS[rendition]
  const light = fullInfo.bytes <= SWATCH_RENDITION_WORTHWHILE_BYTES
  const measured = fullInfo.width !== null && fullInfo.height !== null
  if (!measured) return light ? 'maybe-small-enough' : 'wants-copy'
  const within = (fullInfo.width ?? 0) <= cap && (fullInfo.height ?? 0) <= cap
  return light && within ? 'small-enough' : 'wants-copy'
}

/**
 * What to say about one value's three pictures.
 *
 * `files` is the whole screen's url-to-file map; a url missing from it is one the
 * media library has never heard of, which is a fact worth telling the owner
 * rather than a blank.
 */
export function describeSwatchRenditions(
  swatch: string | null,
  swatchSmall: string | null,
  swatchTiny: string | null,
  files: Record<string, SwatchFileInfo>,
): SwatchRenditionNotes {
  const fullInfo = swatch ? files[swatch] : undefined
  const fullFacts = describeSwatchFile(fullInfo)
  const urls: Record<SwatchRendition, string | null> = { full: swatch, small: swatchSmall, tiny: swatchTiny }

  // What each surface actually draws: the best copy it has, and the original
  // when it has none. Every renderer falls back the same way, so the ladder is
  // written down once here and the screen cannot disagree with the storefront.
  const usedOnProductPage: SwatchRendition = swatchSmall ? 'small' : 'full'
  const usedOnListings: SwatchRendition = swatchTiny ? 'tiny' : swatchSmall ? 'small' : 'full'

  // What gets drawn instead when this box is empty - the next rung down the
  // ladder, named rather than left for the owner to work out. The small copy's
  // audience falls back to the full picture; the tiny copy's falls back to the
  // small copy where there is one, and to the full picture where there is not.
  const insteadFor = (rendition: SwatchRendition): string =>
    rendition === 'tiny' && swatchSmall ? 'the small copy' : `the full picture (${fullFacts})`

  const box = (rendition: SwatchRendition): SwatchRenditionBox => {
    const url = urls[rendition]
    const verdict = judge(rendition, swatch, url, fullInfo)
    const inUse = usedOnProductPage === rendition || usedOnListings === rendition
    const title = TITLES[rendition]
    const lower = title.toLowerCase()

    if (verdict === 'no-picture') {
      return {
        rendition,
        verdict,
        url: null,
        title,
        detail: rendition === 'full'
          ? `No picture yet. Drawn by ${SUBJECT.full}. Click to choose one from the library, or drop an image here.`
          : `Nothing to make one from yet. Drawn by ${SUBJECT[rendition]}. Add a full picture first.`,
        inUse: false,
      }
    }

    if (verdict === 'has-copy') {
      const facts = describeSwatchFile(url ? files[url] : undefined)
      // Worth saying out loud on the full picture once copies exist, because the
      // whole point of the copies is that the storefront stopped using this one.
      const aside = rendition === 'full' && !inUse
        ? ' Nothing on the storefront draws this one now - the copies beside it do.'
        : ''
      const tail = rendition === 'full' ? ` ${PICK}` : ''
      return { rendition, verdict, url, title, detail: `${facts}. Drawn by ${SUBJECT[rendition]}.${aside}${tail}`, inUse }
    }

    const detail: Record<Exclude<SwatchRenditionVerdict, 'no-picture' | 'has-copy'>, string> = {
      'small-enough': `No ${lower}: the full picture (${fullFacts}) is already small enough that a copy would save nothing, so ${SUBJECT[rendition]} use the full picture instead.`,
      'maybe-small-enough': `No ${lower} yet. The full picture is only ${fullFacts}, so making one may save nothing; ${SUBJECT[rendition]} use ${insteadFor(rendition)} meanwhile.`,
      'wants-copy': `No ${lower} yet, so ${SUBJECT[rendition]} use ${insteadFor(rendition)} instead. ${MAKE}`,
      'not-in-library': `No ${lower}: this picture is not in the media library, so there is nothing to shrink. ${SUBJECT[rendition]} use ${insteadFor(rendition)}.`,
    }

    return { rendition, verdict, url: null, title, detail: detail[verdict], inUse }
  }

  return { boxes: [box('full'), box('small'), box('tiny')], usedOnProductPage, usedOnListings }
}
