// Kept free of imports on purpose: proxy.ts reaches this through
// lib/members/paths.ts, and on Netlify the proxy runs as an edge function that
// must not load Prisma (see lib/proxy/data.ts).

// Slug/path blocklist — same pattern used for admin path and usernames
const BLOCKLIST = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'moderator',
  'mod',
  'system',
  'owner',
  'staff',
  'api',
  'setup',
  'login',
  'logout',
  'register',
  'auth',
  // Members system: default member-area path, public profile prefix, and
  // the verification holding page (see MEMBERS_SPEC.md)
  'account',
  'members',
  'verify-email',
  'health',
  'sitemap',
  'robots',
  'favicon',
  'static',
  'public',
  'assets',
  'images',
  'img',
  'uploads',
  'media',
  'cdn',
  'www',
  'mail',
  'email',
  'help',
  'about',
  'contact',
  'privacy',
  'terms',
  'legal',
  'dmca',
  'news',
  'blog',
  'feed',
  'rss',
  'atom',
  'null',
  'undefined',
  'true',
  'false',
])

export function isBlocklisted(value: string): boolean {
  return BLOCKLIST.has(value.toLowerCase())
}
