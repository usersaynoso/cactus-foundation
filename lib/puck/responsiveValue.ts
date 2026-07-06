// Plain types/helpers shared between the client-only field UI
// (ResponsiveValueField.tsx) and server-renderable blocks (GridBlock in
// config.tsx). No 'use client' here deliberately: GridBlock runs on both the
// client editor and the server RSC render path, and a 'use client' export
// can only be *referenced*, never *called*, from server code.
export type Device = 'desktop' | 'tablet' | 'mobile'
export type ResponsiveValue<T> = { desktop?: T; tablet?: T; mobile?: T }

// Pre-existing data (and any prop the caller hasn't migrated) stores this as
// a plain string, desktop-only. Normalising here means the field self-heals
// to the object shape the moment it's touched, with no data migration.
export function normalizeResponsiveValue<T>(value: ResponsiveValue<T> | T | undefined): ResponsiveValue<T> {
  if (value && typeof value === 'object') return value as ResponsiveValue<T>
  return value === undefined || value === '' ? {} : { desktop: value as T }
}
