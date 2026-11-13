// Small inline icons for the member detail screen. Core carries no icon
// library, and these are four strokes apiece - not worth a dependency.
// currentColor throughout, so each one takes the colour of whatever holds it.

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function CheckIcon() {
  return <svg {...base}><path d="M20 6 9 17l-5-5" /></svg>
}

export function CrossIcon() {
  return <svg {...base}><path d="M18 6 6 18M6 6l12 12" /></svg>
}

export function QuestionIcon() {
  return <svg {...base}><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
}

export function CopyIcon() {
  return <svg {...base} width={14} height={14}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
}

export function ShieldIcon() {
  return <svg {...base} width={12} height={12}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
}
