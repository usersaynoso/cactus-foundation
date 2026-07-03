function initialsFor(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

type Props = { label: string; size?: number }

// Inline SVG initials avatar - deliberately a single tone sourced from design
// tokens (not a per-user hue palette), so it stays a hardcoded-hex-free chrome
// element under every theme without needing a bespoke colour list.
export default function GeneratedAvatar({ label, size = 40 }: Props) {
  const initials = initialsFor(label)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={label}
      style={{ borderRadius: '50%', flexShrink: 0 }}
    >
      <rect width="40" height="40" rx="20" fill="var(--color-bg-subtle)" stroke="var(--color-border)" />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-primary)"
        fontSize="15"
        fontWeight="600"
        fontFamily="var(--font-sans)"
      >
        {initials}
      </text>
    </svg>
  )
}
