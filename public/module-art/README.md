# Module card art

One 16:9 image per module, shown at the top of its card on the admin Modules page.

- **Filename:** the module's GitHub repository slug, lowercase, `.webp` - e.g.
  `shop.webp`, `live-chat-powered-by-chatwoot.webp`. The card also tries the module's
  manifest name as a second spelling, so `live-chat.webp` works too.
- **Size:** 1200x675 (16:9), WebP, quality 80-85.
- **No transparency.** The background must be painted edge to edge.
- **One file serves both themes.** The artwork sits on a deep forest-green plate that
  does not follow the theme, so a single dark-green image reads correctly on the light
  card and the dark one.

A module with no file here falls back to a green plate with its initial on it, which is
the same plate the artwork sits on - so a missing image looks deliberate, not broken.

Generation prompts for the whole set: `plans/module-card-art-prompts.md`.
