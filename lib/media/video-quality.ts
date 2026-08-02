// The video optimiser's quality ladder and key rules. No server imports on
// purpose: the dialog that offers the choice and the route that validates it
// read the very same table, so a level can never mean two different things.
//
// ---------------------------------------------------------------------------
// One delivery format, chosen once
// ---------------------------------------------------------------------------
// Every optimised video comes back as MP4 / H.264 High profile / 4:2:0 8-bit,
// AAC audio when there is any, moov atom at the front. That combination is the
// only one every browser, phone, tablet and smart TV in current use plays with
// no fallback file. HEVC and AV1 do compress better, but both have holes (HEVC
// is absent from Chrome and Firefox on plenty of hardware; AV1 from older
// iPhones), and covering the holes means shipping two renditions of everything.
// One file that plays everywhere beats two that mostly do.
//
// ---------------------------------------------------------------------------
// Why these CRF numbers
// ---------------------------------------------------------------------------
// Measured with VMAF against the studio masters (1080p, 8-16 Mbps, 30-45 MB):
//
//   CRF 20  ->  54% of source, VMAF 96.6
//   CRF 23  ->  49% of source, VMAF 96.4     <- default
//   CRF 26  ->  30% of source, VMAF 93.5
//   CRF 28  ->  22% of source, VMAF 91.1
//
// VMAF above ~95 is the band where a viewer cannot pick the copy from the
// original on an ordinary screen. CRF 20 buys 0.2 of a VMAF point for a tenth
// more file, which is why it is the "best quality" option rather than the
// default; below CRF 26 the losses start showing on flat studio backgrounds.

export type VideoQualityLevel = 'high' | 'balanced' | 'small'

export const VIDEO_QUALITY_LEVELS: {
  id: VideoQualityLevel
  label: string
  hint: string
  crf: number
}[] = [
  { id: 'high', label: 'Best quality', hint: 'Barely smaller than the original. For hero videos where every detail counts.', crf: 20 },
  { id: 'balanced', label: 'Balanced (recommended)', hint: 'About half the size, with no visible difference.', crf: 23 },
  { id: 'small', label: 'Smallest file', hint: 'Around a third of the size. Fine for background clips and slow connections.', crf: 26 },
]

export const DEFAULT_VIDEO_QUALITY: VideoQualityLevel = 'balanced'

// Widths offered in the dialog. 1920 keeps a 1080p master at 1080p - the safe
// default, because "optimise" should never be the thing that quietly costs
// resolution. The smaller ones are there for clips that are only ever shown in
// a column half the page wide.
export const VIDEO_WIDTH_CHOICES = [1920, 1280, 1080, 720] as const
export const DEFAULT_VIDEO_MAX_WIDTH = 1920

// Frames beyond this are dropped. Product footage is shot at 25 or 30, so this
// only ever bites on a 50/60 fps export, where halving the frame rate halves
// the bitrate for motion nobody is studying frame by frame.
export const DEFAULT_VIDEO_MAX_FPS = 30

export function crfForQuality(level: VideoQualityLevel): number {
  return VIDEO_QUALITY_LEVELS.find((q) => q.id === level)?.crf
    ?? VIDEO_QUALITY_LEVELS.find((q) => q.id === DEFAULT_VIDEO_QUALITY)!.crf
}

export function isVideoQualityLevel(value: unknown): value is VideoQualityLevel {
  return typeof value === 'string' && VIDEO_QUALITY_LEVELS.some((q) => q.id === value)
}

/**
 * Where the optimised file goes.
 *
 * An .mp4 source is written back over its own key, and that is the whole point:
 * a video's url lives in Puck content, in a module's own tables (the shop keeps
 * product media urls in its own rows) and in whatever an admin pasted somewhere
 * - and only the first of those gets rewritten when a key moves. Same key, same
 * url, nothing to update.
 *
 * A .webm source cannot keep its key, because the bytes really are MP4
 * afterwards and the extension is what types them for the media Worker. Those
 * DO move, and the caller has to rewrite the references it can reach.
 */
export function optimisedVideoKey(sourceKey: string): string {
  return sourceKey.replace(/\.[^./]+$/, '') + '.mp4'
}

export function keyStaysPut(sourceKey: string): boolean {
  return optimisedVideoKey(sourceKey) === sourceKey
}
