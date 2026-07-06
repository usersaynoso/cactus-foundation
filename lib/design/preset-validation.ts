export function isValidPresetTokens(tokens: unknown): boolean {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return false
  const t = tokens as Record<string, unknown>
  const primary = t.primary as Record<string, unknown> | undefined
  return (
    !!primary && typeof primary.light === 'string' && typeof primary.dark === 'string' &&
    typeof t.linkColour === 'string' && typeof t.linkHoverColour === 'string' &&
    typeof t.linkColourDark === 'string' && typeof t.linkHoverColourDark === 'string'
  )
}
