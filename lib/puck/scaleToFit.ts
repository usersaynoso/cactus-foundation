// The arithmetic behind ScaleToFit, kept out of the component so the one rule
// that matters can be pinned by a test: a measurement taken while the element
// has no layout must be DISCARDED, not recorded.
//
// Recording it does lasting damage rather than being merely wrong for a frame.
// An `available` of 0 pins the scale at 1 and the box height at 0; a zero-height
// outer box collapses the inner one (its child asks for height:100%), and the
// contents then paint at their natural size, spilling out of the column with
// nothing left to pull them back. That is the difference between a header logo
// that is briefly too big and one that sits on top of the menu for good.
//
// It is not a rare state: the first effect can easily land before the element
// has a box - a background tab (innerWidth 0), a display:none ancestor at that
// breakpoint, an image that has not decoded yet.

export type ScaleToFitMetrics = { scale: number; boxHeight: number }

// null means "nothing was measurable, stay in the unmeasured state and wait for
// the observers to fire again".
export function scaleToFitMetrics(
  available: number,
  naturalWidth: number,
  naturalHeight: number,
): ScaleToFitMetrics | null {
  if (!(available > 0) || !(naturalWidth > 0) || !(naturalHeight > 0)) return null
  // Only ever shrinks: a column wider than its contents leaves them alone.
  const scale = Math.min(1, available / naturalWidth)
  return { scale, boxHeight: naturalHeight * scale }
}
