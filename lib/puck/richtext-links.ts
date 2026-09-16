// Post-processes sanitised RichText HTML so every link opens away from the
// page. Checkout uses the same rule for terms links - reading a policy page
// must not cost a shopper the product they were looking at.

/** Adds target="_blank" rel="noopener noreferrer" to every anchor that lacks a target. */
export function openRichTextLinksInNewTab(html: string): string {
  if (!html) return html
  return html.replace(/<a(\s[^>]*)?>/gi, (full, attrs = '') => {
    if (/\btarget\s*=/.test(attrs)) return full
    return `<a${attrs} target="_blank" rel="noopener noreferrer">`
  })
}
