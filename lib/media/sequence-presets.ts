import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'

// Scroll-sequence conversion presets, stored as a single JSON column on the
// SiteConfig singleton (same pattern as membersConfig / adminMenuConfig). A null
// or partial column parses to the defaults below, so fresh installs need no row
// changes and new keys can be added without a migration.
//
// There are exactly two presets, keyed 'fast' and 'quality'. They are what the
// convert-to-scroll-sequence dialog offers ("Fast" and "High quality, slower");
// each one carries the three knobs the sequence worker actually reads: which
// background-removal engine to run, how many frames per second to sample, and the
// widest the frames may be. The admin tunes them under Media > Scroll sequences;
// the dialog and the enqueue route only ever read the stored values, so what an
// admin sets is exactly what runs - the browser never gets to pick engine/fps.

// Only 'isnet' is offered. The sharper 'birefnet' model needs 3 GB+ of RAM even
// on a small frame (it does not downscale internally the way isnet does), which
// OOM-kills the conversion worker on its 2 GB-capped box - it shares that box
// with a live database, so the cap cannot simply be lifted. isnet mattes a
// product on a white sweep cleanly and peaks well under the cap, so it is the
// only safe engine here. Dropping 'birefnet' from the enum also self-heals any
// stored preset that still names it: parsing falls back to the isnet defaults.
export const SEQUENCE_ENGINES = ['isnet'] as const
export type SequenceEngine = (typeof SEQUENCE_ENGINES)[number]

export const SEQUENCE_PRESET_KEYS = ['fast', 'quality'] as const
export type SequencePresetKey = (typeof SEQUENCE_PRESET_KEYS)[number]

// One preset's knobs. The ranges mirror the server-side clamps in the enqueue
// route and the worker's own guards, so a value that parses here is a value the
// worker will accept.
const PresetSchema = z.object({
  engine: z.enum(SEQUENCE_ENGINES),
  fps: z.number().int().min(1).max(60),
  maxWidth: z.number().int().min(320).max(3840),
})
export type SequencePreset = z.infer<typeof PresetSchema>

// Both presets run the isnet engine (the only one the worker's box can afford -
// see SEQUENCE_ENGINES). "High quality" earns its name through a higher frame
// rate and a wider frame, not a heavier model: smoother scroll, sharper stills.
export const SequenceConfigSchema = z.object({
  fast: PresetSchema.default({ engine: 'isnet', fps: 15, maxWidth: 1280 }),
  quality: PresetSchema.default({ engine: 'isnet', fps: 30, maxWidth: 1920 }),
})

export type SequenceConfig = z.infer<typeof SequenceConfigSchema>

export const SEQUENCE_CONFIG_DEFAULTS: SequenceConfig = SequenceConfigSchema.parse({})

// Human labels for the two presets, shared by the dialog and the settings panel
// so they never drift.
export const SEQUENCE_PRESET_LABELS: Record<SequencePresetKey, string> = {
  fast: 'Fast',
  quality: 'High quality, slower',
}

// A corrupted column must never take a conversion (or the settings page) down:
// fall back to defaults.
export function parseSequenceConfig(raw: unknown): SequenceConfig {
  const result = SequenceConfigSchema.safeParse(raw ?? {})
  return result.success ? result.data : SEQUENCE_CONFIG_DEFAULTS
}

export async function getSequenceConfig(): Promise<SequenceConfig> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { sequenceConfig: true },
  })
  return parseSequenceConfig(config?.sequenceConfig)
}

export function isSequencePresetKey(value: unknown): value is SequencePresetKey {
  return value === 'fast' || value === 'quality'
}
