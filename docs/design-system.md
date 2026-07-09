> Split from CLAUDE.md — Section 4: DESIGN SYSTEM

> **Superseded —** as of **2026-07-09** the active visual language is **Neon Cockpit HUD**
> (see the **v2.1 Neon Cockpit HUD (2026-07-09)** section at the end of this file). §4.1–4.12
> below describe the earlier "Graphite & Citrus" / glassmorphism direction and are retained
> for history only; the live token palette, HUD utilities, motion, and contrast rules are now
> defined in the v2.1 section. Token *names* were preserved across the change, so the whole app
> re-skinned through the token layer.

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

---

## v2.1 Neon Cockpit HUD (2026-07-09)

> **This section supersedes §4.1–4.2 and the v1.1 glassmorphism language.** On 2026-07-09
> the app creator (Jai Akash) approved an override of locked decision #10 (glassmorphism,
> "zero purple/cyan"). The direction is now a dark, futuristic trading-terminal aesthetic —
> a **Neon Cockpit HUD**. The purple/cyan ban is lifted: electric cyan is the primary brand
> hue and violet is the secondary accent. This section is the source of truth for the visual
> language; earlier §4 subsections are retained for history only.
>
> **What did NOT change** (so the whole app re-skinned through the token layer): the token
> *names*, Inter for UI + **JetBrains Mono for every number**, the Discipline Ring as the
> signature element, the spacing scale, the motion durations/springs, and the reduced-motion
> contract.

### Direction

"A pre-flight cockpit for discipline." A deep-space near-black canvas with a faint HUD
graticule and radial vignette; frosted translucent panels with 1px luminous (cyan-tinted)
borders; corner-bracket ticks on hero cards; soft outer glow on hover/focus. **Glow carries
meaning, never decoration.** The design is loud; the copy stays mentor-calm; the numbers stay
unmissable and legible.

### Token palette

Tokens are HSL triplets in `apps/desktop/src/styles/globals.css`, consumed through Tailwind as
`hsl(var(--token))`. Two themes: **dark = "deep-space cockpit"** (default) and **light =
"daylight cockpit"**. Token names are identical across themes; theme is switched by the
`data-theme` attribute on `<html>` (`src/stores/ui-store.ts`), which Tailwind's `darkMode`
selector and the CSS `:root`/`[data-theme='light']` blocks key off.

**Dark — "deep-space cockpit"**

| Token | HSL | Hex ≈ | Role |
|---|---|---|---|
| `--background` | 227 47% 4% | `#05070E` | page (grid + vignette) |
| `--surface` | 225 50% 8% | `#0A0F1E` | raised panel |
| `--surface-elevated` | 220 43% 11% | `#101828` | elevated panel / inputs |
| `--border` | 221 32% 18% | — | cool hairline |
| `--border-strong` | 220 28% 26% | — | stronger divider |
| `--text-primary` | 219 100% 95% | `#E8F0FF` | body / numbers (AA+) |
| `--text-secondary` | 221 29% 67% | `#94A3C4` | labels (≈7:1 on elevated) |
| `--text-muted` | 216 15% 53% | — | captions (≈4.6:1, AA) |
| `--info` = `--primary` = `--ring` | 188 86% 53% | `#22D3EE` | electric cyan — brand / active |
| `--accent-a` | 158 64% 52% | `#34D399` | neon green — profit / clean |
| `--accent-b` | 258 90% 66% | `#8B5CF6` | violet — secondary (sparing) |
| `--warning` | 43 96% 56% | `#FBBF24` | amber — caution |
| `--danger` = `--destructive` | 351 95% 71% | `#FB7185` | rose — loss / violation |

**Light — "daylight cockpit"** (same roles; hues darkened for AA on a pale steel page; glow is
replaced by crisp 1px borders)

| Token | HSL | Hex ≈ | Role |
|---|---|---|---|
| `--background` | 218 57% 97% | `#F4F7FC` | cool near-white page |
| `--surface` | 0 0% 100% | `#FFFFFF` | card |
| `--text-primary` | 222 47% 11% | `#0F172A` | body (≈15:1) |
| `--info` = `--primary` | 193 82% 31% | `#0E7490` | deep cyan — brand / active |
| `--accent-a` | 163 94% 24% | `#047857` | emerald — profit / clean |
| `--accent-b` | 262 83% 58% | `#7C3AED` | violet — secondary |
| `--warning` | 26 90% 37% | `#B45309` | amber — caution |
| `--danger` | 347 77% 50% | `#E11D48` | rose — loss / violation |

**Semantic mapping** (consistent everywhere): profit/win → `--accent-a` (green); loss/violation
→ `--danger` (rose); active/brand/neutral-active → `--info` (cyan); secondary/neutral data series
→ `--accent-b` (violet); caution → `--warning` (amber). Charts read these tokens via
`src/components/analytics/chart-theme.ts`, so the entire Recharts layer re-skinned for free —
grid lines are a faint hairline, axes muted, and the red/green P&L semantics are preserved.

### HUD utility classes (`globals.css`)

- **Depth / atmosphere:** `.hud-grid` (static 44px cyan graticule, ~3% alpha), `.aurora-mist`
  (drifting nebula), `.aurora-ribbon` (page-top neon strip); grain overlay + neon depth orbs are
  composed in `components/layout/Shell.tsx`.
- **Panels:** `.glass`, `.glass-hero` (cyan→violet wash + cyan halo), `.glass-strong` (modals),
  `.glass-sidebar`.
- **HUD framing:** `.hud-corners` (bracket ticks), `.crown-{a,b,danger,info,warning}` (top
  highlight line), `.card-glow-{a,b,danger,info}` (outer halo 8–15% alpha; muted to crisp borders
  under `[data-theme='light']`).
- **Signal text:** `.text-glow-{a,b,danger,info}` and `.text-gradient-{summit,aurora,danger,amber,info}`
  — hero numerals / icons / large captions only, **never** under small body text.
- **Navigation:** `.trail-line` + `.waypoint-active` (glowing cyan waypoint on the active route),
  `.nav-active-accent`.
- **Signature:** `.summit-halo` (breathing cyan aura behind the Discipline Ring), `.prismatic-edge`
  (rotating conic refractive edge on hover).

`GlassCard` (`components/ui/GlassCard.tsx`) exposes `hero`, `highlight`, and `glow` props that wire
crown/glow/hero for you; new surfaces should prefer it over ad-hoc panel styles.

### Motion

Framer Motion with unchanged spring/duration tokens (`lib/motion.ts`). HUD flourishes: panel
power-on (fade + y/scale on mount, staggered card reveal), number tick-up (Discipline Ring
`useCountUp`, dashboard count-ups), the ring's animated progress-arc sweep, and ambient loops
(`glow-pulse`, `dot-pulse`, `summit-breathe`, `aurora-flow`), plus the rule-violation shake.
**Reduced motion is non-negotiable:** `main.tsx` sets `MotionGlobalConfig.skipAnimations` from
`prefers-reduced-motion` (reactively, so it tracks changes after load), the CSS
`@media (prefers-reduced-motion: reduce)` block collapses every animation/transition to ~0ms, and
components call `useReducedMotion()` to skip count-ups and the arc sweep. Playwright runs under
`reduced-motion: reduce`, so all of the above stays deterministic under E2E.

### Contrast & readability law

- Body text meets **WCAG AA** on its surface (every text token above is AA-verified against its
  intended surface, both themes).
- Numbers are **JetBrains Mono**, tabular (`tabular-nums`), and larger/heavier than the labels
  around them; P&L is the most prominent number on any card.
- **Never** place a glow or gradient text-fill under small body text — glow is reserved for hero
  numerals, icons, borders, and captions rendered large enough to stay crisp.
- Glow encodes state (cyan = active/brand, green = good, rose = bad, amber = caution). If a glow
  would not communicate meaning, it is not used.

### Where it lives (hero surfaces upgraded beyond the token layer)

Sidebar + TopBar (HUD frame, glowing active waypoint, attribution preserved bottom-left), Shell
(aurora ribbon + grid + nebula backdrop), DashboardPage (cockpit stat cards with crown lines,
glow orbs, composite gauges) + DisciplineRing (neon glow filter, count-up, sweep, summit halo),
PreTradePanel (rule check reads as a pre-flight checklist — subtle pass rows, glowing red hard-edge
blocking rows), Onboarding (cockpit backdrop, segmented HUD progress, "Cockpit ready" finish),
shared Modal / toast / GuardrailBanner / ConflictResolver (glow border by severity), and the
dev gallery `features/dev/ComponentsPage.tsx`.
