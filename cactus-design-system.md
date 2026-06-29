# Cactus Design System

> Admin UI design language for the Cactus platform.
> Public-facing themes are owned by Puck and are out of scope for this system.

---

## Principles

**Resilient, not decorative.** Cactus survives in harsh conditions by being structurally efficient, not ornate. Every UI element earns its place.

**Sharp where it matters.** Security boundaries, destructive actions, and system states are communicated with the same precision as a cactus spine — unmistakable, pointed, honest.

**Warm-neutral by default.** The interface recedes so content and editing surfaces lead. Warmth comes from the sand palette, not from decorative colour.

**Developer-legible.** Monospaced elements (admin paths, passkey IDs, webhook URLs, env var names) are first-class citizens in the type system.

---

## Design Tokens

### 2.1 Colour

#### Primitive Palette

```css
/* Cactus greens */
--cactus-50:  #eef6f1;
--cactus-100: #d0e8db;
--cactus-200: #a3d1bc;
--cactus-300: #6db49a;
--cactus-400: #459578;
--cactus-500: #2c7558;  /* brand primary */
--cactus-600: #22604a;
--cactus-700: #1a4c3a;
--cactus-800: #133929;
--cactus-900: #0e2a1e;
--cactus-950: #071611;

/* Spine (terracotta) — destructive, warning, sharp edges */
--spine-50:   #fdf0ec;
--spine-100:  #fad8cd;
--spine-200:  #f5b09c;
--spine-300:  #ed7e60;
--spine-400:  #e05232;
--spine-500:  #c94223;  /* destructive primary */
--spine-600:  #a8341a;
--spine-700:  #872913;
--spine-800:  #671f0e;
--spine-900:  #4c160a;
--spine-950:  #2b0a05;

/* Sand (neutral) */
--sand-50:    #faf9f7;
--sand-100:   #f4f2ee;
--sand-200:   #e6e2da;
--sand-300:   #d2cdbf;
--sand-400:   #b0a896;
--sand-500:   #8e856f;
--sand-600:   #6e6657;
--sand-700:   #544e42;
--sand-800:   #3b3730;
--sand-900:   #272420;
--sand-950:   #16140f;
```

#### Semantic Aliases

```css
/* Page & surface */
--color-bg:             var(--sand-50);
--color-bg-subtle:      var(--sand-100);
--color-surface:        #ffffff;
--color-surface-raised: var(--sand-50);
--color-overlay:        rgba(39, 36, 32, 0.45); /* sand-900 at 45% */

/* Borders */
--color-border:         var(--sand-200);
--color-border-strong:  var(--sand-300);
--color-border-focus:   var(--cactus-400);

/* Text */
--color-text:           var(--sand-900);
--color-text-secondary: var(--sand-600);
--color-text-muted:     var(--sand-400);
--color-text-disabled:  var(--sand-300);
--color-text-inverse:   #ffffff;

/* Primary (cactus green) */
--color-primary:        var(--cactus-500);
--color-primary-hover:  var(--cactus-600);
--color-primary-active: var(--cactus-700);
--color-primary-subtle: var(--cactus-50);
--color-primary-border: var(--cactus-200);
--color-on-primary:     #ffffff;

/* Destructive (spine terracotta) */
--color-destructive:        var(--spine-500);
--color-destructive-hover:  var(--spine-600);
--color-destructive-subtle: var(--spine-50);
--color-destructive-border: var(--spine-200);
--color-on-destructive:     #ffffff;

/* Status */
--color-success:    #1e6644;
--color-success-bg: #e8f5ee;
--color-warning:    #92530a;
--color-warning-bg: #fef7eb;
--color-error:      var(--spine-500);
--color-error-bg:   var(--spine-50);
--color-info:       #1a5fa8;
--color-info-bg:    #eaf2fb;
```

#### Dark Mode Overrides

Applied under `[data-theme="dark"]` or `@media (prefers-color-scheme: dark)`.

```css
[data-theme="dark"] {
  --color-bg:             #131210;
  --color-bg-subtle:      #1c1a17;
  --color-surface:        #1c1a17;
  --color-surface-raised: #252320;
  --color-border:         #3a3630;
  --color-border-strong:  #514d44;
  --color-text:           #f0ede8;
  --color-text-secondary: #a89f91;
  --color-text-muted:     #6e6657;
  --color-text-disabled:  #3f3c35;
  --color-primary:        var(--cactus-400);
  --color-primary-hover:  var(--cactus-300);
  --color-primary-subtle: #0e2a1e;
  --color-destructive:    var(--spine-400);
  --color-destructive-hover: var(--spine-300);
  --color-destructive-subtle: #2b0a05;
}
```

---

### 2.2 Typography

#### Typefaces

```css
--font-sans: "Instrument Sans", system-ui, -apple-system, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, "Cascadia Code", monospace;
```

**Instrument Sans** is used for all UI chrome, headings, labels, and body copy. It has enough geometric precision to feel technical at small sizes while remaining approachable at display sizes.

**JetBrains Mono** is used for all developer-facing content: admin paths, passkey IDs, API keys, webhook URLs, environment variable names, code snippets, and anything the user might need to copy exactly.

#### Type Scale

```css
--text-xs:   11px; --leading-xs:  1.4; /* Status labels, helper text, footnotes */
--text-sm:   13px; --leading-sm:  1.5; /* Table cells, badge labels, captions */
--text-base: 15px; --leading-base: 1.6; /* Body copy, form inputs, descriptions */
--text-lg:   17px; --leading-lg:  1.5; /* Section intros, card titles */
--text-xl:   20px; --leading-xl:  1.4; /* Page section headings */
--text-2xl:  24px; --leading-2xl: 1.3; /* Page headings (h2) */
--text-3xl:  30px; --leading-3xl: 1.2; /* Page title (h1) */
```

#### Weight Usage

```css
--font-normal:   400; /* Body copy, descriptions */
--font-medium:   500; /* Labels, nav items, table column headers */
--font-semibold: 600; /* Page headings, card titles, dialog titles */
```

---

### 2.3 Spacing

Base unit: 4px.

```css
--space-0:  0;
--space-px: 1px;
--space-0-5: 2px;
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
--space-24: 96px;
```

**Layout-level tokens:**

```css
--sidebar-width:      240px;
--content-max-width:  860px;
--settings-max-width: 680px;
--panel-padding:      var(--space-6);  /* 24px */
--section-gap:        var(--space-8);  /* 32px */
--card-padding:       var(--space-5);  /* 20px */
--form-gap:           var(--space-5);  /* 20px */
```

---

### 2.4 Border & Radius

```css
--border-width:   1px;
--border-width-2: 2px;

--radius-none: 0;
--radius-sm:   4px;
--radius:      6px;    /* Default: inputs, buttons, badges */
--radius-md:   8px;
--radius-lg:   12px;   /* Cards, modals, panels */
--radius-xl:   16px;
--radius-full: 9999px; /* Pills, avatar circles */
```

---

### 2.5 Shadow (Elevation)

```css
--shadow-none: none;
--shadow-sm:   0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow:      0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06);
--shadow-md:   0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06);
--shadow-lg:   0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04);
--shadow-xl:   0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04);
```

---

### 2.6 Motion

```css
--dur-fast:   100ms;
--dur-base:   150ms;
--dur-slow:   250ms;
--dur-enter:  200ms;
--dur-exit:   150ms;

--ease-out:    cubic-bezier(0, 0, 0.2, 1);
--ease-in:     cubic-bezier(0.4, 0, 1, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

Respect `@media (prefers-reduced-motion: reduce)` by setting all durations to `0ms` and removing spring easings.

---

## Components

### 3.1 Button

#### Variants

| Variant | Background | Text | Border | Use when |
|---------|-----------|------|--------|----------|
| `primary` | `--color-primary` | white | none | Single main action per page/dialog |
| `secondary` | white | `--color-text` | `--color-border` | Supporting actions |
| `ghost` | transparent | `--color-text` | transparent | Tertiary, low-emphasis actions |
| `destructive` | `--color-destructive` | white | none | Permanent, irreversible actions |
| `link` | none | `--color-primary` | none | Inline contextual navigation |

#### Sizes

| Size | Height | Padding H | Font size |
|------|--------|-----------|-----------|
| `sm` | 30px | 10px | 13px |
| `md` | 36px | 14px | 14px |
| `lg` | 42px | 18px | 15px |

#### States

| State | Visual |
|-------|--------|
| Default | Base appearance |
| Hover | Darken/lighten background by one stop |
| Active | `scale(0.98)`, darken by two stops |
| Focus-visible | `outline: 2px solid var(--color-border-focus); outline-offset: 2px` |
| Disabled | 40% opacity, `cursor: not-allowed` |
| Loading | Replace label with spinner; maintain width |

#### Accessibility

- Role: `button`
- Always has a visible text label or `aria-label`
- Loading state: `aria-busy="true"`, `aria-label="Saving…"` (or equivalent)
- Disabled: `disabled` attribute preferred over `aria-disabled`

#### Do / Don't

| Do | Don't |
|----|-------|
| "Save changes" | "Submit" |
| "Delete module" | "OK" |
| One `primary` per view | Multiple `primary` buttons side by side |
| Verb-first label | Noun-only label ("Deletion") |

---

### 3.2 Input (Text)

#### Anatomy

```
[ Label                ]
[ Input field           ]
[ Helper / error text  ]
```

#### States

| State | Border | Background |
|-------|--------|-----------|
| Default | `--color-border` | white |
| Hover | `--color-border-strong` | white |
| Focus | `--color-border-focus` (2px) + focus ring | white |
| Disabled | `--color-border` | `--color-bg-subtle` |
| Error | `--color-error` (2px) | `--color-error-bg` tint |
| Read-only | `--color-border` | `--color-bg-subtle` |

#### Sizing

Height matches Button sizes: `sm` = 30px, `md` = 36px (default), `lg` = 42px.

#### Variants

- `text` — default
- `search` — left icon, clear button
- `password` — toggle visibility button on right
- `code` — uses `--font-mono`, slightly higher letter-spacing

#### Accessibility

- Role: `textbox` (implicit)
- Always paired with a visible `<label>` or `aria-label`
- Error state: `aria-invalid="true"` + `aria-describedby` pointing at error text
- Placeholder does not replace a label

---

### 3.3 Textarea

Same anatomy, states, and error pattern as Input. Default `min-height: 96px`. Resizable vertically only (`resize: vertical`). Auto-grow variant available (JS-driven).

---

### 3.4 Select

Shares the same height, states, and error pattern as Input. Uses a custom dropdown built on the native `<select>` or Radix `Select`. Right-side chevron icon. Always has a placeholder option with value `""`.

---

### 3.5 Toggle (Switch)

| Property | Value |
|---------|-------|
| Track width | 36px |
| Track height | 20px |
| Thumb diameter | 16px |
| Off colour | `--sand-300` |
| On colour | `--color-primary` |
| Thumb colour | white |

State transition: `var(--dur-base) var(--ease-in-out)`.

Role: `switch`. Always associated with a label. Checked state: `aria-checked="true"`.

---

### 3.6 Checkbox

16px × 16px. Checked fill: `--color-primary`. Check icon: white 2px stroke. Indeterminate: horizontal dash. Focus ring matches Input.

Role: `checkbox`. Label to the right, 8px gap.

---

### 3.7 Form Group

```
<label>       [required marker *]
[Input / Select / Textarea]
<p class="hint">  Helper text (muted, 13px)  </p>
<p class="error"> Error text (error colour)  </p>
```

- `--form-gap` (20px) between groups
- Required marker `*` is `aria-hidden`; required state is indicated via `aria-required`
- Error text replaces hint text; both use `id` referenced by `aria-describedby`

---

### 3.8 Badge

#### Variants

| Variant | Background | Text | Border | Use for |
|---------|-----------|------|--------|---------|
| `default` | `--color-bg-subtle` | `--color-text-secondary` | `--color-border` | Neutral tags |
| `primary` | `--color-primary-subtle` | `--cactus-700` | `--color-primary-border` | Selected, active |
| `success` | `--color-success-bg` | `--color-success` | transparent | Published, active, healthy |
| `warning` | `--color-warning-bg` | `--color-warning` | transparent | Pending, update available |
| `error` | `--color-error-bg` | `--color-error` | transparent | Error, incompatible |
| `info` | `--color-info-bg` | `--color-info` | transparent | Informational |

#### Sizes

- `sm`: 11px text, 2px/8px padding — for table cells
- `md`: 12px text, 3px/10px padding — default
- `lg`: 13px text, 4px/12px padding — standalone context

All badges: `--radius-full`, `font-weight: 500`.

---

### 3.9 Card

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);  /* 12px */
  padding: var(--card-padding);      /* 20px */
  box-shadow: var(--shadow-sm);
}
```

#### Variants

- `flat` — no shadow, used inside panels
- `raised` — default, with `--shadow-sm`
- `interactive` — raised, hover state lifts to `--shadow-md` with border darkening

#### Anatomy

- Optional top accent bar (2px, `--color-primary`) for featured/active cards
- Title (`text-lg`, `font-semibold`)
- Description (`text-sm`, `--color-text-secondary`)
- Metadata row (badges, timestamps)
- Footer (actions right-aligned)

---

### 3.10 Dialog / Modal

- Max width: 480px (default), 640px (wide), 360px (confirmation)
- Backdrop: `--color-overlay`
- Container: `--color-surface`, `--radius-lg`, `--shadow-xl`
- Header: title (`text-xl`, `font-semibold`) + optional close button (ghost)
- Body: `24px` padding, scrollable when tall
- Footer: right-aligned button group (primary action rightmost)

Enter/exit: fade + translate-y (8px → 0, `--dur-enter` / `--dur-exit`).

Role: `dialog`. `aria-modal="true"`. Title referenced by `aria-labelledby`. Focus trap. Escape closes unless `persistent`.

---

### 3.11 Toast / Notification

Positioned bottom-right. Stack up to 3 visible.

| Property | Value |
|---------|-------|
| Width | 360px |
| Border radius | `--radius-lg` |
| Padding | 14px 16px |
| Auto-dismiss | 5 000ms (error: no auto-dismiss) |

Left accent stripe (4px) encodes variant:
- `success`: `--color-success`
- `warning`: `--color-warning`
- `error`: `--color-error`
- `info`: `--color-info`

Role: `status` (info/success) or `alert` (warning/error). `aria-live="polite"` for non-errors, `assertive` for errors.

---

### 3.12 Table

```
[ Filter bar / search ]
[ Table                          ]
[ Table header row — sticky      ]
[ Table body rows                ]
[ Pagination row                 ]
```

- Header: `text-sm`, `font-medium`, `--color-text-secondary`, `--color-bg-subtle` background
- Body rows: `text-sm`, `text-base` for primary cell. Hover: `--color-bg-subtle`
- Borders: 1px horizontal only (`border-bottom: 1px solid var(--color-border)`)
- Checkbox column: 40px, always first
- Actions column: auto-width, right-aligned, visible on row hover only
- Sort icon: `↑↓` inline, active direction highlighted

Accessibility: `<table>`, `<thead>`, `<tbody>`. Sortable columns use `aria-sort`. Row actions accessible by keyboard.

---

### 3.13 Dropdown Menu

Trigger: any button with a chevron or ellipsis icon.
Panel: `--color-surface`, `--radius-md`, `--shadow-lg`, `min-width: 180px`.
Item height: 32px. Item padding: 8px 10px.
Keyboard: Arrow keys navigate, Enter activates, Escape closes.

Item types:
- Default — label only
- Labelled icon — 16px Tabler icon left, label
- Destructive — label in `--color-destructive`
- Separator — 1px horizontal rule, 4px vertical margin
- Section header — `text-xs`, `--color-text-muted`, not interactive

---

### 3.14 Sidebar Navigation

The sidebar is the primary wayfinding surface in the Cactus admin. The "spine" motif — the 2px left-border active indicator — is the system's signature element.

```css
.sidebar {
  width: var(--sidebar-width);   /* 240px */
  padding: var(--space-4) var(--space-3);
  background: var(--color-bg-subtle);
  border-right: 1px solid var(--color-border);
}

.nav-item {
  height: 34px;
  border-radius: var(--radius);
  padding: 0 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.nav-item--active {
  color: var(--color-primary);
  background: var(--color-primary-subtle);
  border-left: 2px solid var(--color-primary);
  padding-left: 8px; /* compensates for border */
}

.nav-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  padding: 16px 10px 4px;
}
```

Sections (in order): Content, Media, Appearance, Settings, Modules, Help.

---

### 3.15 Tabs

- Horizontal by default, aligns to content left edge
- Tab bar: `border-bottom: 1px solid var(--color-border)`
- Active tab: bottom border 2px `--color-primary`, text `--color-text`
- Inactive: text `--color-text-secondary`
- Height: 40px per tab
- Role: `tablist` / `tab` / `tabpanel`. Keyboard: Arrow left/right, Enter.

---

### 3.16 Breadcrumb

`text-sm`. Items: `--color-text-secondary`. Last item (current): `--color-text`, not a link. Separator: `/` in `--color-text-muted`. Overflow: collapse middle items behind a `…` trigger.

---

### 3.17 Avatar

Circular. Sizes: 24px (xs), 32px (sm), 40px (md), 56px (lg).
Fallback (no image): 2-letter initials, `--cactus-100` background, `--cactus-700` text.
Image variant: `object-fit: cover`, `border-radius: --radius-full`.

---

### 3.18 Tooltip

Trigger: hover/focus on any element with `data-tooltip` or `aria-describedby`.
Panel: `--sand-900` background, white text, `text-xs`, `--radius` corners, 6px/10px padding.
Arrow: 6px. Delay: 400ms show, 0ms hide.
Role: `tooltip`.

---

### 3.19 Skeleton / Loading

`--sand-200` base with shimmer animation. Matches shape of the content it replaces. `border-radius` matches the element being loaded (e.g., `--radius-full` for avatar skeletons, `--radius` for text blocks).

```css
@keyframes skeleton-shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg,
    var(--sand-200) 25%, var(--sand-100) 50%, var(--sand-200) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
}
```

---

### 3.20 Empty State

```
[ Icon (48px, --color-text-muted) ]
[ Heading (text-lg, font-semibold) ]
[ Description (text-sm, --color-text-secondary, max-width: 320px) ]
[ Primary action button (optional) ]
```

Centred vertically and horizontally inside its container. Heading: name the space, invite action. Example: "No pages yet" / "Create your first page."

---

### 3.21 Pagination

`Previous` and `Next` buttons (secondary), page number buttons (ghost for inactive, primary for current). Gap 4px between items. Show first, last, and ± 2 pages around current. Collapse others with `…`.

---

## Cactus-specific Components

### 4.1 Permission Badge

Indicates the minimum role required to access a resource. Always displayed near a heading or action, never alone.

| Role | Label | Variant |
|------|-------|---------|
| Admin | `Admin only` | `error` badge + lock icon |
| Editor | `Editor+` | `warning` badge + lock icon |
| Public | `Public` | `default` badge |

---

### 4.2 Module Status Card

Extends the base Card component. Displays a module's install state and available action.

```
[ Module icon  Module name           ]  [ Status badge ]
[ Short description (2 lines max)    ]
[ Version installed → Version available ]
[ ----                    [ Update ] ]
```

Status badges:
- `Installed` — success
- `Update available` — warning
- `Incompatible` — error
- `Not installed` — default

---

### 4.3 Provider Connection Card

Displays the connection state of a media/email/integration provider.

```
[ Provider logo  Provider name       ]  [ Connected / Disconnected ]
[ Account / bucket / endpoint info   ]
[ ----             [ Configure ] [ Disconnect ] ]
```

Shows obfuscated keys where applicable (last 8 chars only).

---

### 4.4 Passkey Item

List item in the WebAuthn device management UI.

```
[ <icon: passkey>   Device name     ]
[ Last used: 2 days ago · Created: Jan 4, 2025 ]
                           [ Rename ] [ Remove ]
```

Device name is `font-mono` if it is a raw AAGUID fallback.

---

### 4.5 Page Status Badge

In-line page status indicator used in the page list and Puck sidebar.

| Status | Badge variant | Label |
|--------|-------------|-------|
| Published | `success` | `Published` |
| Draft | `default` | `Draft` |
| Scheduled | `info` | `Scheduled · Jan 15` |
| Private | `warning` | `Private` |

---

### 4.6 Media Asset Card

Grid card for the media library.

```
[ Thumbnail (aspect-video or aspect-square) ]
[ Filename (text-sm, truncated)             ]
[ Size · Type · Dimensions  (text-xs, muted)]
```

Selected state: primary border (2px), primary subtle background tint.
Hover: overlay with Copy URL and Insert actions.

---

## Patterns

### 5.1 Form Layout

Settings and data entry forms:

```
[ Page heading (h1, text-2xl)   ]
[ Description (text-base, muted)]

[ Card                           ]
  [ Section heading (h2, text-lg) ]
  [ Section description (muted)   ]

  [ Form Group: Label / Input / Hint ]
  [ Form Group: Label / Select / Hint ]
  [ Form Group: Label / Toggle       ]

  [ Divider ]
  [ Destructive zone (spine-50 bg)   ]
  [ Form Group: Label / Input        ]

[ Footer: Cancel (secondary) · Save changes (primary) ]
```

Footer sticks to bottom of viewport on long forms.

---

### 5.2 Settings Section

Within a settings card, a "destructive zone" is visually separated:

```css
.destructive-zone {
  margin-top: var(--space-6);
  padding: var(--space-5);
  background: var(--color-destructive-subtle);
  border: 1px solid var(--color-destructive-border);
  border-radius: var(--radius-md);
}
```

Contains delete/disconnect actions. Always requires a confirmation Dialog before executing.

---

### 5.3 Data Table Page

```
[ Page heading (h1)                      ]
[ Search input        [ + New item ]     ]

[ Table                                  ]
  [ Sticky header row                    ]
  [ Body rows, 10 per page default       ]

[ Pagination bar                         ]
```

Filter / search is above the table, not inside it. Actions per row: visible on hover, always accessible by keyboard.

---

### 5.4 Confirmation Dialog

Used before any irreversible action.

```
[ Dialog: 36px × 480px max-width              ]
[ Title: "Delete this page?" (text-xl, 600)   ]
[ Body: Explain what will be permanently lost  ]
[ ----                                         ]
[ [Cancel]          [Delete page] (destructive)]
```

For high-stakes deletions (e.g., removing a provider with media files), require the user to type the resource name before the destructive button enables.

---

### 5.5 Error State (Page-level)

```
[ Icon: ti-alert-triangle (48px, --color-error) ]
[ Heading: "Something went wrong"               ]
[ Description: Specific, actionable message     ]
[ [ Retry ] or [ Go back ]                      ]
```

Never show raw error messages or stack traces to non-admin users. Admin users may see a collapsible technical details section (mono text, `--color-bg-subtle`).

---

## Tailwind Configuration Reference

```js
// tailwind.config.js (abbreviated)
module.exports = {
  theme: {
    extend: {
      colors: {
        cactus: {
          50: '#eef6f1', 100: '#d0e8db', 200: '#a3d1bc',
          300: '#6db49a', 400: '#459578', 500: '#2c7558',
          600: '#22604a', 700: '#1a4c3a', 800: '#133929',
          900: '#0e2a1e', 950: '#071611',
        },
        spine: {
          50: '#fdf0ec', 100: '#fad8cd', 200: '#f5b09c',
          300: '#ed7e60', 400: '#e05232', 500: '#c94223',
          600: '#a8341a', 700: '#872913', 800: '#671f0e',
        },
        sand: {
          50: '#faf9f7', 100: '#f4f2ee', 200: '#e6e2da',
          300: '#d2cdbf', 400: '#b0a896', 500: '#8e856f',
          600: '#6e6657', 700: '#544e42', 800: '#3b3730',
          900: '#272420', 950: '#16140f',
        },
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
      },
    },
  },
};
```

---

## Naming Conventions

| Concept | Token prefix | Example |
|---------|-------------|---------|
| Brand colour | `cactus-*` | `cactus-500` |
| Destructive colour | `spine-*` | `spine-500` |
| Neutral colour | `sand-*` | `sand-200` |
| Semantic alias | `color-*` | `color-primary` |
| Spacing | `space-*` | `space-4` |
| Border radius | `radius-*` | `radius-lg` |
| Shadow / elevation | `shadow-*` | `shadow-md` |
| Motion duration | `dur-*` | `dur-base` |
| Motion easing | `ease-*` | `ease-spring` |
| Layout constants | named | `sidebar-width` |

All component class names use BEM-style flat naming: `.card`, `.card--interactive`, `.nav-item--active`.

---

*Cactus Design System · MIT License · github.com/usersaynoso/cactus-foundation*
