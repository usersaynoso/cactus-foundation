// Starter layout templates for the searchResults layout type, collected by
// scripts/generate-module-layout-types.mjs (core) via this module's
// cactus.module.json layoutTypes.types[].starterImport/starterExport.
// PURE DATA - imported into the browser; nothing but object literals here.
//
// Seeding is opt-in per template: core's seedTemplates() copies the ones marked
// publishByDefault and skips the rest entirely - it does not seed drafts. This one
// was unmarked, so an install got no Search layout at all and the Search tab under
// Layouts sat empty with nothing to say why; worse, the stamp recording the
// one-and-only seeding attempt goes on regardless, so no later release could fill
// it in. It is marked now, and costs nothing visually: /search already renders
// this exact arrangement by hand when no layout is published (see
// app/public/search/page.tsx), so the only change is that the owner can now open
// it and move things about.

const block = (type: string, id: string, props: Record<string, unknown> = {}) => ({ type, props: { id, ...props } })

export function searchResultsStarters() {
  return [
    {
      id: 'starter-search-results-standard',
      name: 'Standard',
      description: 'A search box with the full results list underneath.',
      publishByDefault: true,
      data: {
        content: [
          block('SiteSearch', 'search-box-1', {
            mode: 'page',
            presentation: 'fieldWithButton',
            placeholder: 'Search…',
            buttonLabel: 'Search',
            size: 'large',
            widthMode: 'full',
          }),
          // productCardStyle spelled out so the sidebar shows the pick that is
          // in force rather than an empty select; shop-absent installs fall
          // back to standard rows on their own.
          block('SiteSearchResults', 'search-results-1', { productCardStyle: 'shopCard' }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}
