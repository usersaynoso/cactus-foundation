// Layout for the member detail screen. One stylesheet string rendered once by
// the screen, because the layout needs media queries and inline styles cannot
// carry those. Every class is prefixed `mbr-` so nothing here can collide with
// a core utility class or a module's own. Colours are tokens only; the dark
// theme comes free from them.
//
// Module-contributed sections (the members.admin-member-detail extension point)
// render as ordinary `.card`s inside `.mbr-main`, so a module needs to know
// nothing about this file to sit comfortably on the page.
export const MEMBER_DETAIL_CSS = `
.mbr-page { display: flex; flex-direction: column; gap: var(--space-5); }
.mbr-back { font-size: var(--text-sm); color: var(--color-text-muted); text-decoration: none; display: inline-flex; align-items: center; gap: var(--space-1); }
.mbr-back:hover { color: var(--color-text); }

.mbr-hero { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--space-5); align-items: center; }
.mbr-hero__avatar { border-radius: 50%; box-shadow: 0 0 0 3px var(--color-surface), 0 0 0 4px var(--color-border); line-height: 0; }
.mbr-hero__name { font-size: var(--text-2xl); line-height: var(--leading-2xl); font-weight: var(--font-semibold); margin: 0; overflow-wrap: anywhere; }
.mbr-hero__sub { margin: var(--space-1) 0 0; font-weight: var(--font-medium); color: var(--color-text-secondary); overflow-wrap: anywhere; }
.mbr-hero__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); margin-top: var(--space-1); color: var(--color-text-muted); font-size: var(--text-sm); }
.mbr-hero__meta a { color: inherit; }
.mbr-hero__badges { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
.mbr-hero__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; align-self: start; }

.mbr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-md); border: none; background: none; color: var(--color-text-muted); cursor: pointer; padding: 0; }
.mbr-icon-btn:hover { background: var(--color-bg-subtle); color: var(--color-text); }
.mbr-icon-btn:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 1px; }

.mbr-callout { border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: var(--color-surface-raised); padding: var(--space-4) var(--space-5); display: flex; gap: var(--space-4); align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
.mbr-callout--warning { border-color: var(--color-warning-border); background: var(--color-warning-bg); }
.mbr-callout--danger { border-color: var(--color-destructive-border); background: var(--color-destructive-subtle); }
.mbr-callout--info { border-color: var(--color-info-border); background: var(--color-info-bg); }
.mbr-callout__title { font-weight: var(--font-semibold); margin: 0 0 var(--space-1); color: var(--color-text); }
.mbr-callout__body { margin: 0; font-size: var(--text-sm); color: var(--color-text); max-width: 60ch; }
.mbr-callout__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }

.mbr-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; grid-template-areas: "main side"; gap: var(--space-5); align-items: start; }
.mbr-main { grid-area: main; min-width: 0; }
.mbr-side { grid-area: side; display: flex; flex-direction: column; gap: var(--space-4); position: sticky; top: var(--space-4); }
.mbr-side .card, .mbr-main .card { margin-bottom: 0; }
.mbr-stack { display: flex; flex-direction: column; gap: var(--space-4); }

.mbr-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
.mbr-card-head .card-title { margin: 0; }
.mbr-card-sub { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }

.mbr-facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-2) var(--space-4); margin: 0; font-size: var(--text-sm); }
.mbr-facts dt { color: var(--color-text-muted); }
.mbr-facts dd { margin: 0; color: var(--color-text); text-align: right; overflow-wrap: anywhere; }

.mbr-consent { display: flex; gap: var(--space-3); align-items: flex-start; }
.mbr-consent__dot { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--color-border); background: var(--color-bg-subtle); color: var(--color-text-secondary); }
.mbr-consent__dot--yes { background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border); }
.mbr-consent__dot--no { background: var(--color-destructive-subtle); color: var(--color-destructive); border-color: var(--color-destructive-border); }
.mbr-consent__label { font-weight: var(--font-semibold); margin: 0; }

.mbr-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-sm); }
.mbr-checklist li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.mbr-checklist__state { color: var(--color-text-muted); }
.mbr-checklist__state--on { color: var(--color-success); font-weight: var(--font-medium); }

.mbr-rows { list-style: none; margin: 0; padding: 0; }
.mbr-rows > li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--color-border); }
.mbr-rows > li:first-child { border-top: none; padding-top: 0; }
.mbr-rows__primary { font-weight: var(--font-medium); color: var(--color-text); }
.mbr-rows__secondary { font-size: var(--text-sm); color: var(--color-text-muted); }

.mbr-timeline { list-style: none; margin: 0; padding: 0; position: relative; }
.mbr-timeline > li { position: relative; padding: 0 0 var(--space-4) var(--space-6); }
.mbr-timeline > li::before { content: ""; position: absolute; left: 5px; top: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); box-shadow: 0 0 0 3px var(--color-surface); }
.mbr-timeline > li::after { content: ""; position: absolute; left: 8px; top: 16px; bottom: 0; width: 2px; background: var(--color-border); }
.mbr-timeline > li:last-child::after { display: none; }
.mbr-timeline > li:last-child { padding-bottom: 0; }

.mbr-note { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--color-surface-raised); border: 1px solid var(--color-border); }
.mbr-note p { margin: 0 0 var(--space-1); white-space: pre-wrap; overflow-wrap: anywhere; }

.mbr-empty { margin: 0; padding: var(--space-6) var(--space-4); text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); border: 1px dashed var(--color-border); border-radius: var(--radius-md); }

.mbr-danger { border-color: var(--color-destructive-border); }
.mbr-danger .card-title { color: var(--color-destructive); }

.mbr-toast { position: fixed; right: var(--space-5); bottom: var(--space-5); z-index: 60; max-width: min(420px, calc(100vw - 2 * var(--space-5))); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); box-shadow: var(--shadow-md, var(--shadow-sm)); border: 1px solid var(--color-success-border); background: var(--color-success-bg); color: var(--color-success); font-size: var(--text-sm); font-weight: var(--font-medium); display: flex; gap: var(--space-3); align-items: center; }
.mbr-toast--error { border-color: var(--color-destructive-border); background: var(--color-destructive-subtle); color: var(--color-destructive); }

@media (max-width: 1100px) {
  .mbr-layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: "side" "main"; }
  .mbr-side { position: static; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); }
}
@media (max-width: 720px) {
  .mbr-hero { grid-template-columns: auto minmax(0, 1fr); }
  .mbr-hero__actions { grid-column: 1 / -1; justify-content: flex-start; }
  .mbr-hero__name { font-size: var(--text-xl); }
}
@media (prefers-reduced-motion: no-preference) {
  .mbr-toast { animation: mbr-toast-in var(--dur-enter) var(--ease-out); }
}
@keyframes mbr-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
`
