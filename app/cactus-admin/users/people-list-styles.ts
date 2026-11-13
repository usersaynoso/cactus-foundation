// Layout for the Users list. One stylesheet string, rendered once by the list,
// because the responsive column hiding needs media queries. Every class is
// prefixed `ppl-` so nothing here can collide with a core utility or a module's
// own classes. Colours are tokens only.
export const PEOPLE_LIST_CSS = `
.ppl { display: flex; flex-direction: column; gap: var(--space-4); }

.ppl-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.ppl-chip { display: inline-flex; align-items: baseline; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-secondary); font: inherit; font-size: var(--text-sm); cursor: pointer; transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out); }
.ppl-chip:hover { border-color: var(--color-border-strong); color: var(--color-text); }
.ppl-chip:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
.ppl-chip[aria-pressed="true"] { border-color: var(--color-primary); background: var(--color-primary-subtle); color: var(--color-text); }
.ppl-chip__n { font-size: var(--text-lg); font-weight: var(--font-semibold); color: var(--color-text); font-variant-numeric: tabular-nums; }

.ppl-bar { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.ppl-search { position: relative; flex: 1 1 260px; min-width: 0; }
.ppl-search input { width: 100%; padding-left: 2.25rem; padding-right: 2rem; }
.ppl-search__icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); pointer-events: none; line-height: 0; }
.ppl-search__clear { position: absolute; right: 0.375rem; top: 50%; transform: translateY(-50%); }
.ppl-bar select { flex: 0 1 auto; min-width: 0; max-width: 100%; }
.ppl-bar__spacer { flex: 1 1 0; }

.ppl-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-md); border: none; background: none; color: var(--color-text-muted); cursor: pointer; padding: 0; font: inherit; }
.ppl-icon-btn:hover { background: var(--color-bg-subtle); color: var(--color-text); }
.ppl-icon-btn:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 1px; }

.ppl-meta { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; font-size: var(--text-sm); color: var(--color-text-muted); }

.ppl-table { position: relative; }
.ppl-table[aria-busy="true"] tbody { opacity: 0.55; transition: opacity var(--dur-base) var(--ease-out); }
.ppl-table th { white-space: nowrap; }
.ppl-sort { display: inline-flex; align-items: center; gap: var(--space-1); border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }
.ppl-sort:hover { color: var(--color-text); }
.ppl-sort:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; border-radius: var(--radius-md); }
.ppl-person { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.ppl-person__text { min-width: 0; }
.ppl-person__name { font-weight: var(--font-medium); color: var(--color-text); text-decoration: none; overflow-wrap: anywhere; }
a.ppl-person__name:hover { text-decoration: underline; }
.ppl-person__org { font-size: var(--text-sm); color: var(--color-text-secondary); font-weight: var(--font-medium); overflow-wrap: anywhere; }
.ppl-person__sub { font-size: var(--text-sm); color: var(--color-text-muted); overflow-wrap: anywhere; }
.ppl-muted { color: var(--color-text-muted); }
.ppl-badges { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.ppl-row--suspended td { background: var(--color-bg-subtle); }
.ppl-row--suspended .ppl-person__name { color: var(--color-text-secondary); }

.ppl-empty { text-align: center; padding: var(--space-10) var(--space-4) !important; color: var(--color-text-muted); }
.ppl-empty p { margin: 0 0 var(--space-3); }

.ppl-pager { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; font-size: var(--text-sm); color: var(--color-text-muted); }
.ppl-pager__buttons { display: flex; gap: var(--space-2); align-items: center; }

.ppl-skeleton { display: block; height: 0.875rem; border-radius: var(--radius-md); background: var(--color-bg-subtle); }

@media (max-width: 960px) {
  .ppl-col-joined, .ppl-col-type { display: none; }
}
@media (max-width: 720px) {
  .ppl-col-marketing { display: none; }
  .ppl-bar select { flex: 1 1 calc(50% - var(--space-2)); }
}
@media (prefers-reduced-motion: no-preference) {
  .ppl-skeleton { animation: ppl-pulse 1.4s var(--ease-in-out) infinite; }
}
@keyframes ppl-pulse { 50% { opacity: 0.5; } }
`
