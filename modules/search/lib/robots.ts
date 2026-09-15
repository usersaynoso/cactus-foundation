// Scanned by scripts/generate-module-router.mjs (mirrors modules/shop/lib/robots.ts).
// Search-results URLs are infinite query permutations - crawlers stay out.
//
// Anchored with '$' and '?' rather than a bare '/search'. A Disallow is a
// PREFIX match, so '/search' also blocks every root-slug page whose slug
// happens to start with those six letters - a product, a collection, a blog
// post. That is not hypothetical: it silently blocked a live Gazette post
// called "search-filters-and-finding-the-right-chair-in-three-clicks" from
// Google and from Facebook's link-preview crawler, which reports a robots
// block as a 403. '$' and '*' are standard robots.txt special characters
// (RFC 9309) and are honoured by Google, Bing and Facebook alike.
export async function getPublicRobotsDisallow(): Promise<string[]> {
  return ['/search$', '/search?']
}
