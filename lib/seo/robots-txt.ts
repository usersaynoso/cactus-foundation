// robots.txt, assembled by hand.
//
// This file exists because Next's own robots metadata route can only express
// what its Robots type has fields for - user agent, allow, disallow, crawl
// delay, sitemap - and two of the things a site now has to say to AI crawlers
// are neither. A Content-Signal line and a plain comment pointing at /llms.txt
// have no field to live in, so the file is serialised here instead and served
// from app/robots.txt/route.ts.
//
// The output for a site with no AI rules set is byte-for-byte what the metadata
// route produced before, which is the whole point: the change is additive or it
// is a regression on every live site at once.

export type RobotsGroup = {
  /** One group may address several agents; each gets its own User-agent line. */
  userAgents: string[]
  allow?: string[]
  disallow?: string[]
  /**
   * Lines emitted inside the group, verbatim, after the User-agent lines and
   * before the rules - Content-Signal and anything else with no field of its
   * own. Already-formatted "Name: value"; nothing here is escaped or checked
   * beyond stripping newlines, so only ever pass values the site owner chose
   * from a fixed list.
   */
  extraLines?: string[]
  /** A `#` comment line above the group. */
  comment?: string
}

export type RobotsDocument = {
  groups: RobotsGroup[]
  sitemaps?: string[]
  /** `#` comment lines at the very top of the file. */
  headerComments?: string[]
}

// A newline inside a value would end the directive and let whatever followed it
// be read as a directive of its own. Nothing in here is meant to be attacker-
// controlled, but robots.txt is a file where one stray line changes what a
// crawler is permitted to do, so the guard is not left to the callers.
function clean(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export function serialiseRobotsTxt(doc: RobotsDocument): string {
  const lines: string[] = []

  for (const comment of doc.headerComments ?? []) {
    const text = clean(comment)
    if (text) lines.push(`# ${text}`)
  }
  if (lines.length) lines.push('')

  for (const group of doc.groups) {
    const agents = group.userAgents.map(clean).filter(Boolean)
    // A group with no agent addresses nobody; emitting it would silently attach
    // its rules to whichever group came before.
    if (agents.length === 0) continue

    const comment = group.comment ? clean(group.comment) : ''
    if (comment) lines.push(`# ${comment}`)
    for (const agent of agents) lines.push(`User-agent: ${agent}`)
    for (const extra of group.extraLines ?? []) {
      const text = clean(extra)
      if (text) lines.push(text)
    }
    for (const path of group.allow ?? []) {
      const text = clean(path)
      if (text) lines.push(`Allow: ${text}`)
    }
    for (const path of group.disallow ?? []) {
      const text = clean(path)
      if (text) lines.push(`Disallow: ${text}`)
    }
    lines.push('')
  }

  for (const sitemap of doc.sitemaps ?? []) {
    const text = clean(sitemap)
    if (text) lines.push(`Sitemap: ${text}`)
  }

  // Exactly one trailing newline, however the sections above ended.
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}
