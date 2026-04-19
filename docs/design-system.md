> Split from CLAUDE.md — Section 4: DESIGN SYSTEM

## 4. DESIGN SYSTEM

### 4.1 Design Direction

**"Bloomberg Terminal meets Linear meets a Zen garden."**

Professional but calm. Information-dense but spacious. Every pixel earns its place. The app should feel like a tool owned by a serious person — not a flashy retail product.

### 4.2 Color Palette

**Philosophy:** Two modes. Both are rich, deliberate, and distinct from common trading-app palettes (no generic purple/cyan, no Robinhood green, no Bloomberg orange-on-black cliché).

**Dark mode — "Graphite & Citrus"**
- Base background: `#0E1012` (warm graphite, not pure black)
- Surface (cards): `#16191D`
- Surface elevated (modals): `#1C2025`
- Border subtle: `#23272E`
- Border strong: `#2E333B`
- Text primary: `#E8EAED`
- Text secondary: `#9BA1A9`
- Text muted: `#5F656E`
- **Accent A — Signal (wins, positive, active):** `#B4E048` (electric lime)
- **Accent B — Process (discipline, rules, gold-standard):** `#D4A24C` (muted amber-gold)
- Warning: `#E8A33D`
- Danger: `#E25C5C` (desaturated, not fire-engine red)
- Info: `#6B9FFF`

**Light mode — "Bone & Forest"**
- Base background: `#F7F5F0` (warm bone, not cold white)
- Surface: `#FFFFFF`
- Surface elevated: `#FFFFFF` with stronger shadow
- Border subtle: `#E8E4DC`
- Border strong: `#D4CFC4`
- Text primary: `#1A1D21`
- Text secondary: `#4F5560`
- Text muted: `#8B8F96`
- **Accent A — Signal:** `#2F6B3A` (deep forest green)
- **Accent B — Process:** `#A0762B` (antique bronze)
- Warning: `#C47B15`
- Danger: `#B64545`
- Info: `#2F5ABF`

**Semantic pairs (used consistently everywhere):**
- Win/profit → Accent A
- Clean rules followed → Accent B
- Loss → Danger (muted)
- Rule broken → Danger with a specific "cracked" treatment (see §4.7)

**Gradient usage:** Extremely sparingly. Only on the Discipline Ring (§4.9) and the main dashboard hero number. Never on buttons or cards.

### 4.3 Typography

**Fonts:**
- **Inter** — UI, body, labels (variable font, weights 400/500/600/700)
- **JetBrains Mono** — all numbers, prices, pip values, timestamps, account IDs (weights 400/500/600)

**Scale (dark/light mode same):**
- `display-xl` — 56px / 64 / -0.02em (rarely used, dashboard hero)
- `display-lg` — 40px / 48 / -0.02em
- `display` — 32px / 40 / -0.01em
- `h1` — 24px / 32 / -0.01em
- `h2` — 20px / 28
- `h3` — 17px / 24
- `body-lg` — 16px / 24
- `body` — 14px / 20
- `body-sm` — 13px / 18
- `caption` — 12px / 16 / 0.01em (labels, captions)
- `micro` — 11px / 14 / 0.03em uppercase (badges, tags)

**Number formatting rules:**
- Always JetBrains Mono for numbers.
- Tabular figures enabled (`font-variant-numeric: tabular-nums`).
- Currency prefix (no trailing). E.g., `$5,000.00` not `5,000.00 USD`.
- Pips with 1 decimal for FX, e.g., `24.3 pips`.
- Percentages with 2 decimals, e.g., `-0.87%`.
- R-multiples with 2 decimals, explicit sign, e.g., `+2.34R`, `-1.00R`.

### 4.4 Spacing & Layout

- **Base unit:** 4px. Everything is a multiple (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96).
- **Content max-width:** 1440px, centered on wider displays.
- **Sidebar width:** 240px, collapsed 64px.
- **Card padding:** 20px default, 24px for primary cards, 16px for compact.
- **Card radius:** 14px default, 10px for compact elements, 20px for hero elements.
- **Grid gap:** 16px default, 12px compact, 24px generous.

### 4.5 Shadows & Depth

**Dark mode:** Shadows are barely visible (`rgba(0,0,0,0.4)` small offsets). Depth is conveyed by background lightness steps, not shadows. Optional inner glow on focused cards using border + subtle accent-color `box-shadow` at 8% opacity.

**Light mode:** Shadows are the primary depth mechanic.
- `shadow-sm`: `0 1px 2px rgba(15, 20, 25, 0.04), 0 1px 3px rgba(15, 20, 25, 0.06)`
- `shadow-md`: `0 4px 8px rgba(15, 20, 25, 0.04), 0 2px 4px rgba(15, 20, 25, 0.06)`
- `shadow-lg`: `0 12px 24px rgba(15, 20, 25, 0.08), 0 4px 8px rgba(15, 20, 25, 0.06)`
- `shadow-xl`: `0 24px 48px rgba(15, 20, 25, 0.12), 0 8px 16px rgba(15, 20, 25, 0.08)`

### 4.6 Motion Language

**Principles:**
1. Motion is physical. Use spring physics (Framer Motion `spring`), not linear easing for entrances.
2. Motion is purposeful. Every animation communicates state or hierarchy.
3. Motion is restrained. Never loop. Never decorate.
4. Motion respects reduced motion preference (`prefers-reduced-motion: reduce` → transitions become instant, no spring overshoot).

**Spring defaults:**
- Default: `stiffness: 260, damping: 26`
- Bouncy (celebrations, rare): `stiffness: 400, damping: 20`
- Settled (layouts): `stiffness: 180, damping: 30`

**Standard durations (for non-spring):**
- Instant: 80ms
- Short: 160ms
- Base: 240ms
- Long: 400ms
- Hero: 600ms

**Specific motion moments:**

| Moment | Motion |
|---|---|
| Page transition | Cross-fade 160ms, no slide |
| Card entrance (grid reveal) | Stagger 40ms, spring from y+12 opacity 0 |
| Number count-up | 800ms ease-out, dashboard numbers only |
| Win trade logged | Accent A soft pulse 1x, 400ms |
| Loss trade logged | Danger soft pulse 1x, 400ms |
| Rule violation attempted | Shake horizontally 4px, 3 oscillations, 300ms |
| Rule gate unlock (cleared) | Checkmark draw-on 240ms + soft glow |
| Trade save success | Toast slide up spring, auto-dismiss 2.4s |
| Modal open | Scale 0.96→1 + opacity 0→1, spring |
| Modal close | Scale 1→0.98 + opacity 1→0, 120ms ease-in |
| Sidebar icon hover | Scale 1.08, 120ms |
| Button press | Scale 0.97, 80ms |
| Tab change | Underline slides to new tab, spring |
| Chart entrance | Path draw-on 600ms ease-out |
| Discipline Ring fill/crack | See §4.9 |

### 4.7 Rule Violation Visual Treatment

When a rule is violated (either attempted or logged on a past trade):
- The field/card/trade row gets a **"cracked" visual** — a thin danger-colored border with 2-3 asymmetrical "crack" lines drawn across it using SVG path animations.
- Accompanying subtle red tint on background (2% opacity).
- Tooltip/label states which rule was violated in plain English.
- This visual is never cutesy. It looks like a structural flaw.

### 4.8 Iconography

- Lucide React throughout. Stroke width 1.5 (slightly thinner than default for elegance).
- Size scale: 14, 16, 18, 20, 24, 28.
- Color inherits from `currentColor`; never colored icons unless semantic (e.g., accent A for wins).
- Avoid emoji anywhere in the UI. Exceptions: none.

### 4.9 Signature Element — The Discipline Ring

A circular progress ring displayed prominently on the dashboard. It is the app's signature visual.

**Mechanics:**
- Represents **Rule Adherence Score** for the current period (default: last 20 trades, configurable).
- 0% to 100% fill, animated.
- Fill color:
  - 95-100% → Accent A (signal green/forest green) with soft outer glow
  - 80-94% → Accent B (amber-gold/bronze)
  - 60-79% → Warning (muted orange)
  - Below 60% → Danger, with visible **cracks** in the ring (SVG paths breaking through the stroke)
- Center displays the number, JetBrains Mono, `display-lg`.
- Below the number: a caption stating the calculation basis (e.g., "Last 20 trades").
- On hover: transitions to show a breakdown (which rules were broken most).
- When a rule is broken in real time: the ring briefly shakes, a crack appears, and the score updates with a spring animation.

This ring is what the user sees first on the dashboard. It is the moral compass of the app.

### 4.10 Component Aesthetic Baseline

**Cards:**
- 14px radius, surface color, 1px subtle border.
- No drop shadows in dark mode; depth via color.
- Hover: subtle border brightening (no transform, no lift).
- Focus-within: accent border, soft glow.

**Buttons:**
- Primary: filled with Accent A (signal), text in base-bg color. Hover: brightness up 6%. Active: scale 0.97.
- Secondary: 1px border, transparent bg, text primary. Hover: subtle bg tint.
- Ghost: no border, no bg, text secondary. Hover: subtle bg tint.
- Destructive: danger-colored filled. Used only for actual destructive actions.
- Disabled: 40% opacity, cursor not-allowed, no hover state.
- Sizes: sm (32px), md (38px), lg (44px). Padding scales accordingly.
- Corner radius: 10px default.

**Inputs:**
- Surface elevated bg, 1px subtle border, 10px radius.
- Focus: Accent A border, soft glow (2px, 12% opacity).
- Error: Danger border, small inline error text below.
- Numeric inputs: JetBrains Mono, right-aligned, with visible unit badges (e.g., "pips", "%", "$").
- Label above, small caption hints below.

**Badges:**
- Small, 6px radius, caption-size.
- Variants: default, success (A), process (B), warning, danger, info, neutral.
- Solid or outlined; outlined preferred for frequency density.

**Tables:**
- Zero-border rows, 1px horizontal divider only.
- Sticky header with subtle tint.
- Row hover: 2% accent tint.
- Monospace for any numeric column.
- Sortable columns show sort indicator on hover.
- Row actions revealed on hover (right-aligned icon buttons).

**Modals & Dialogs:**
- Center screen, max-width 560px unless content-specific.
- Scale+fade entrance.
- Backdrop: base-bg at 72% with 8px blur.
- Trap focus, close on ESC, close on backdrop click (except for destructive-confirm dialogs).

**Toasts:**
- Bottom-right stack, max 3 visible.
- Slide-up spring entrance.
- 2.4s auto-dismiss default, 6s for errors, sticky for rule violations.
- Include undo action where applicable.

### 4.11 Dark/Light Mode Toggle

- Toggle in sidebar bottom.
- Sun/moon icon with spring rotation.
- Theme switch is instant, no flicker (apply class to `html` before paint).
- Stored in settings (localStorage + SQLite).
- Respects OS preference on first launch, then honors user choice.

### 4.12 Attribution

In the sidebar bottom-left corner, below the theme toggle:
- Text: `Designed & built by Jai Akash`
- Font: Inter, 11px, text-muted, letter-spacing 0.02em.
- Hover: opacity 1 (from 0.4), 160ms ease.
- Always present. Never referenced anywhere else in the app.
