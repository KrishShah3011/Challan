# Design-2: Cyberpunk redesign

**Branch:** `Design-2` (from `milestone-1` @ fc4ae83)
**Brief (user, 2026-10-11):** Overhaul the whole UI in a Cyberpunk 2077 style: bright neon colours, bold type, dark mode, plenty of animation and movement. Keep every feature working.

**Design read:** This is a visual overhaul of an internal GST invoicing app (forms, lists, tables) used on phone and desktop by one small business. It uses a Cyberpunk 2077 neon-HUD look, built on Mantine theme tokens, one global stylesheet and native CSS motion.
**Dials:** VARIANCE 6 (the forms must stay easy to use), MOTION 7, DENSITY unchanged.
**User overrides of generic taste rules:** neon glows are allowed, and the app is dark-only.

## 1. Hard constraints (functionality is frozen)

1. **Visuals only.** Do not change any visible text, label, `aria-*`, role, `data-testid`, route, heading level, button name, handler or logic. The e2e suite checks exact accessible names and text. The existing copy stays as it is, including the em-dash in `No internet — your work is safe on this screen`.
2. **Do not touch:** `src/lib/**`, `src/auth.tsx` logic, `src/router.tsx`, `tests/**`, `supabase/**`, `scripts/**`.
3. **Files that may change:** `src/theme.ts`, `src/main.tsx`, `index.html`, a new `src/styles/cyber.css`, and the presentational JSX and props in `src/components/*.tsx` and `src/pages/*.tsx` (`className`, `style`, color props, wrapper elements, decorative `aria-hidden` elements).
4. **New dependencies** (exact versions, nothing else): `@fontsource-variable/orbitron@5.3.0`, `@fontsource/chakra-petch@5.3.0`, `@fontsource-variable/jetbrains-mono@5.3.0`. No motion or animation library. CSS keyframes and transitions only.
5. **Accessible-name safety:**
   - Never put text in CSS `content:` on anything inside or around an element that tests find by name. Use `content: ""` only, because generated content is part of the accessible name.
   - Glitch effects use `text-shadow` or `aria-hidden` sibling layers, never duplicated text in pseudo-elements.
   - Do not use `text-transform: uppercase` on headings, buttons, links, labels or tabs. Headings can still look loud through Orbitron weight and tracking.
6. **Playwright stability:** interactive elements (buttons, links, inputs, tiles, rows, tabs, options) must never run `infinite` animations or animate their box while idle. Hover, focus and active transitions of 200 ms or less are fine. Infinite or ambient motion goes only on decorative, `aria-hidden`, `pointer-events: none` layers.
7. **Reduced motion:** set `respectReducedMotion: true` in the Mantine theme, and use `@media (prefers-reduced-motion: reduce)` to turn every keyframe animation off and freeze the background.
8. **Size:** the 18px+ font sizes and `size: 'lg'` component defaults stay. The owner relies on large text.

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| `--cy-bg` | `#07080d` | page background |
| `--cy-surface` | `#0e1119` | Paper, Card, Modal, AppShell bars |
| `--cy-surface-2` | `#151a26` | inputs, table stripes, item-card totals row |
| `--cy-line` | `#23304a` | 1px borders |
| `--cy-text` | `#e6f1ff` | body text |
| `--cy-dim` | `#8ea3c0` | dimmed text (≥ 7:1 on bg) |
| `--cy-yellow` | `#fcee0a` | **primary**: filled buttons (text `#07080d`), active nav, h1 accents |
| `--cy-cyan` | `#00f0ff` | focus, hover glow, info alerts, links, same-state badge |
| `--cy-red` | `#ff2a55` | danger, errors, delete |
| `--cy-magenta` | `#ff2bd6` | secondary accent only (IGST badge, background haze) |
| `--cy-green` | `#39ff88` | success (saved check, success notifications) |

Each colour has one meaning: yellow is action, cyan is focus and info, red is danger, green is success. Do not use them as decoration outside these roles, except in the background haze.

**Mantine mapping (in `theme.ts`):**
- Override the 10-shade tuples `dark`, `yellow`, `cyan`, `blue` (maps to the cyan family, because existing `color="blue"` alerts are info), `red`, `green`, `teal` (maps to cyan), `violet` (maps to magenta) and `orange`.
- Add a custom `neon` tuple built on `#fcee0a` as `primaryColor`. Choose `primaryShade` so filled buttons are exactly `#fcee0a`, and set `autoContrast: true` so their text is dark.
- `white: '#e6f1ff'`, `black: '#07080d'`, `defaultRadius: 0`.
- Set the body background, text and dimmed colours through `cssVariablesResolver` (dark).
- In `main.tsx`, change `forceColorScheme` to `"dark"`.

**Type:**
- Headings: Orbitron variable, weight 800, `letter-spacing: 0.04em`, `line-height: 1.15`. h1 uses `clamp(1.6rem, 4.5vw, 2.6rem)` so `Invoice 2026-27/001 saved` wraps cleanly on a 360px phone.
- Body: Chakra Petch 500, with 600 for labels and 700 for strong text.
- Money and numbers: JetBrains Mono with `font-variant-numeric: tabular-nums`. Apply it through a `.cy-num` class to totals values, the grand total, table money cells and invoice numbers in list rows.

## 3. Shape and surface system (one rule, used everywhere)

- **Buttons and Home tiles:** chamfered corners (`clip-path` cuts the top-left and bottom-right corners by 10px). Because `clip-path` hides outer shadows, show glow with `filter: brightness()` or an inner `box-shadow` and a sweep on `::after`. Focus uses `outline: 2px solid var(--cy-cyan); outline-offset: -5px`.
- **Paper, Card and Modal:** square corners, a 1px `--cy-line` border and `--cy-surface`. Add HUD corner brackets: an `::before` 14px yellow L at the top-left and an `::after` cyan L at the bottom-right, with `content: ""` and `pointer-events: none`. On hover or focus-within, the border turns cyan with `box-shadow: 0 0 0 1px var(--cy-cyan), 0 0 22px rgb(0 240 255 / .25)`. Use Mantine `classNames` in `theme.ts` or global selectors in `cyber.css`, whichever is cleaner, but pick one approach.
- **Inputs, Select, Textarea, PasswordInput:** square corners, `--cy-surface-2` fill and a 1px line border. On focus the border turns cyan with a soft cyan glow. Labels are `--cy-text` 600, errors `--cy-red`, placeholders `--cy-dim`. Select dropdowns use the dark surface with a cyan border, and the hovered option is cyan at 12% opacity.
- **Alerts and notifications:** dark surface with a 3px left bar in the semantic colour, and the title in the semantic colour.
- **Badges:** outline neon, with text in the semantic colour and a matching glow.
- **Tables:** header cells in Orbitron at a small size, `--cy-cyan`, not uppercase. Rows stripe with `--cy-surface-2`, borders use `--cy-line`, and money cells use `.cy-num`.
- **Tabs:** the active tab gets a yellow 3px underline that grows from the centre (scaleX), plus yellow text.
- **Modal:** overlay `rgb(7 8 13 / .8)` with `blur(3px)`, a HUD-frame body and an Orbitron title.

## 4. Layout changes

- **AppShell (desktop ≥ 900px):** 72px header, `--cy-surface` at 85% with `backdrop-filter: blur(8px)`, and a 1px bottom border with a cyan to magenta gradient hairline.
  - Nav links: Chakra Petch 600 in `--cy-dim`. Hover turns them `--cy-text` with a cyan text-glow. The active link is `--cy-yellow` with a 3px yellow bar below that animates `scaleX(0→1)`.
  - From 1200px up only, show a decorative brand lockup `CHALLAN` (Orbitron 900, yellow, `aria-hidden="true"`, not a link) left of the nav. The nav must stay on one line from 900px.
- **AppShell (phone):** the 84px footer nav uses the same surface, a gradient hairline on top, and the active item in yellow with a glowing 3px bar along the top edge. `PHONE_LINKS` stays the same.
- **Route transition:** in `AppLayout`, wrap `<Outlet />` in a `div` keyed by `location.pathname` with `.cy-enter`. That is 260ms of opacity 0→1, translateY 8px→0 and `clip-path: inset(0 0 100% 0)`→`inset(0)`. It shows the page change.
- **Backdrop:** a fixed `aria-hidden` `div.cy-backdrop` (z-index 0, `pointer-events: none`), rendered once in `AppLayout` and once in `Login` when not embedded. It has three layers:
  1. Radial hazes: magenta at the top-right and cyan at the bottom-left, both at 10–14% opacity.
  2. A perspective grid floor across the bottom 45%, made of thin cyan lines at 15% opacity. It scrolls with an infinite `translateY` keyframe over 6s and fades out towards the horizon.
  3. Scanlines: `repeating-linear-gradient` at 3px and 5% opacity.

  App content sits above it (`position: relative; z-index: 1`).
- **Home:** an h1 `Home` with the glitch-in effect, then the tiles.
  - Tiles are chamfered with an icon in yellow, the label in Orbitron 700 and a staggered entry (`--i` index × 60ms, 320ms fade-up).
  - On hover or focus, a cyan sweep crosses `::after` once, the border glows and the icon gets a short chromatic `drop-shadow` jitter (one 180ms run, not infinite).
  - The `ExportButton` tile uses the same tile class, replacing its white background and `TILE_STYLE`. `TILE_STYLE` can be deleted once nothing imports it.
- **Login (not embedded):**
  - From 900px up, a two-column split. Left: the h1 `Invoices` (huge Orbitron, yellow, glitch-in) above one plain line, `GST invoices, drafts and Excel export.` (dimmed, decorative `<p>`, the only new copy allowed). Right: the form inside a HUD-frame Paper.
  - On a phone, the columns stack.
  - When embedded (inside the re-login modal), keep the current layout and only restyle it.
- **Invoice saved screen** (`InvoiceEditor` success state): the check icon in `--cy-green` with a neon ring that pulses twice and stops, and the heading with the glitch-in effect.
- **Totals:** values in `.cy-num`. The grand total is large JetBrains Mono in yellow with a soft glow. When its value changes, it flickers once for 300ms (key an inner `span` on the value). The text of the `data-testid="grand-total"` element must stay exactly the formatted amount.
- **Invoice list rows and draft and master rows:** HUD-frame cards. On hover, a cyan left bar slides in through `scaleY`. Invoice numbers use `.cy-num` in yellow.
- **Loader:** Mantine `Loader` type `bars` in yellow (set in the theme defaults).

## 5. Hard-coded light colours to replace (from the codebase)

| Location | Now | Change to |
|---|---|---|
| `AppLayout.tsx` NavLink inline style | blue-8 / gray-9 | class-based styles from §4 |
| `ExportButton.tsx:61` | `background: var(--mantine-color-white)` + `TILE_STYLE` | tile class |
| `Home.tsx` | `TILE_STYLE` + `radius="md"` | tile class |
| `ItemCard.tsx:71` | `bg="gray.0"`, `borderRadius: 8` | `--cy-surface-2`, radius 0 |
| `c="gray.7"` (InvoiceEditor, Drafts, InvoiceList, InvoiceView) | gray | `c="dimmed"` |
| `c="red.8"` (InvoiceEditor, PasswordForm) | red | `c="red"` (neon red tuple) |
| `CompanyForm.tsx:83` `c="orange.9"` | orange | `c="orange"` (neon orange tuple, contrast ≥ 4.5:1) |
| `InvoiceEditor.tsx:244` icon `green-7` | green | `--cy-green` + ring pulse |
| `InvoiceEditor.tsx:373` badge teal/violet | | stays teal/violet; the tuples map to cyan/magenta |

## 6. Motion inventory (every animation has a reason)

| Animation | Where | Reason | Infinite? |
|---|---|---|---|
| `cy-enter` page reveal | route wrapper | shows the page changed | no |
| `cy-glitch-in` (chromatic `text-shadow` split that settles into a steady glow, 450ms) | every h1 | marks the page title | no |
| nav bar `scaleX` | active nav link | shows where you are | no |
| tile stagger and hover sweep | Home | entry order and hover feedback | no |
| button press `scale(.98)` and `::after` sweep on hover | all buttons | touch feedback | no |
| grand-total flicker | TotalsPanel | the value changed | no |
| success ring pulse | saved screen | confirms the save | no (2 runs) |
| grid floor scroll, haze drift | backdrop | atmosphere | yes (decorative layer only) |
| brand flicker (opacity only, every ~7s) | `CHALLAN` lockup | atmosphere | yes (aria-hidden, not interactive) |

Animate only `transform`, `opacity`, `clip-path`, `filter` and `text-shadow`.

## 7. Done means

1. `npm test` and `npm run build` pass.
2. `npx supabase start` (Docker is running), then `npm run test:e2e`: every spec passes on both `desktop` and `phone`. Any failure is either a regression to fix in the styling or one of the §1 rules was broken. Never edit tests.
3. Screenshots (Playwright, logged in as the e2e user, desktop 1440×900 and Pixel 7) of Login, Home, New invoice (with one item and one charge filled), the saved screen, the invoice list, invoice view, Drafts, Lists (all three tabs), Settings, and one open modal. Save them to the session scratchpad. Look at every one and fix contrast, overflow and broken layout.
4. Run `grep -rn "gray\.\|blue-8\|gray-9\|mantine-color-white\|TILE_STYLE" src` and confirm there are no leftover light-theme colours.
5. Commit on `Design-2` with the message `feat: cyberpunk redesign of the whole UI`, without staging `.codex/`.
