// Shown while an admin route's data is in flight. Next.js swaps it in inside the
// admin shell, so the sidebar and chrome stay put and only the content area waits -
// rather than the whole screen sitting blank on the slowest query.
//
// Deliberately generic: this one boundary covers every admin route, so it sketches
// the shape they share (a page header, some cards) rather than any one page.
// Colours are semantic tokens only, so it reads correctly in light and dark.

const STYLES = `
@keyframes admin-loading-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
.admin-loading-bar {
  background: var(--color-border);
  border-radius: var(--radius);
  animation: admin-loading-pulse 1.4s ease-in-out infinite;
}
.admin-loading-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-8);
}
.admin-loading-stat {
  margin-bottom: 0;
  padding: var(--space-5);
  text-align: center;
}
.admin-loading-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
@media (prefers-reduced-motion: reduce) {
  .admin-loading-bar { animation: none; }
}
`

// Slightly uneven widths so the placeholder reads as content, not a barcode.
const ROW_WIDTHS = ['92%', '78%', '85%', '64%', '88%']

export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <span className="sr-only">Loading…</span>

      <div className="page-header" aria-hidden="true">
        <div className="admin-loading-bar" style={{ width: '13rem', height: '2rem' }} />
        <div className="admin-loading-bar" style={{ width: '7rem', height: '2.25rem', borderRadius: 'var(--radius-md)' }} />
      </div>

      <div className="admin-loading-stats" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card admin-loading-stat">
            <div className="admin-loading-bar" style={{ width: '3.5rem', height: '1.75rem', margin: '0 auto' }} />
            <div className="admin-loading-bar" style={{ width: '5rem', height: '0.75rem', margin: 'var(--space-3) auto 0' }} />
          </div>
        ))}
      </div>

      <div className="card" aria-hidden="true">
        <div className="admin-loading-bar" style={{ width: '30%', height: '1.125rem', marginBottom: 'var(--space-5)' }} />
        <div className="admin-loading-rows">
          {ROW_WIDTHS.map((width, i) => (
            <div key={i} className="admin-loading-bar" style={{ width, height: '0.875rem' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
