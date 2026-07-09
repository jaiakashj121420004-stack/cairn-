# Nvexis — Design Guidelines (Brand Bible)

*The single source of truth for how Nvexis looks. Every project, post, slide, app, and page follows this. Version 4.0 · 28 June 2026.*
*System name: **The Almanac** (Editorial Authority) — a serious publication with a century of back-issues, not a startup template.*

> **Why this exists:** ~88% of a brand judgment happens in the first 90 milliseconds, driven mostly by colour, and ~46% of people judge credibility on visual design alone. Consistency across every surface is what turns a logo into a brand. Use the exact tokens below — they are law.

---

## 1. Design philosophy

**What we are NOT (the looks we reject):**
- ❌ The **generic AI / fintech** look — navy/blue-black, neon gradients, glassmorphism, Inter, and the four-point "✨" sparkle. Everyone ships it; it reads machine-made. *(It's also where our old mark and spring-green accidentally lived — the sparkle is the most AI-coded glyph in use, and #46CC5B sat in the Robinhood/Spotify family.)*
- ❌ The **get-rich-quick guru** look — gold-on-black, hype, fake luxury, shouting. The exact opposite of who we are.

**What we ARE: The Almanac.** A serious, century-old publication. Two inks on aged paper — **oxblood** and **ink** on **parchment**. The authority of a bound financial almanac and a printer's craft: earned knowledge, the long voyage, depth over noise. Character comes from a distinctive serif and disciplined editorial layout, not from effects.

> **"Isn't warm + serif the 'Claude trap' we rejected in v3?"** No — and the distance is the point. Claude's palette is *coral/peach on cream* — soft, friendly, conversational. Ours is **oxblood (#7A2A26) on parchment**: the deep blood-red of old ledgers, set in a high-contrast display serif on a precise editorial grid. One is a warm chatbot; the other is a serious publishing house.

**Five principles:**
1. **Authority over decoration.** Rules, drop caps, folios, generous margins. It reads *edited* — a publication, not a feed.
2. **Two inks, one paper.** Oxblood is the only chroma in the room. Restraint is the luxury.
3. **Earned, not loud.** No neon, no gold, no hype. The seriousness *is* the differentiation — built for people who do the work, not the get-rich-quick crowd.
4. **Set, don't decorate.** Character comes from the type (Fraunces + Spectral) and the grid — never from gloss, glow, or gradients.
5. **Two true modes.** Day (parchment) is the hero — it's a publication. Night (ink) is its lamplit pair, never an afterthought.

---

## 2. The two modes (designed as a pair)

Both are first-class. **Day** is the hero (a publication is read on paper); **Night** is the same almanac read by lamplight.

| | Day (light, hero) | Night (dark) |
|---|---|---|
| **Page** | Parchment **#ECE4D6** | Ink **#181210** |
| **Surface (cards)** | `#F4EEE2` | `#211917` |
| **Text** | Ink `#221A14` · body `#4A3F35` | Bone `#ECE2D2` · body `#C7BAA9` |
| **Muted** | Umber `#5E5346` | `#9E9082` |
| **Hairline** | `#CDBFA8` | `#352724` |
| **Accent** | Oxblood **#7A2A26** | Oxblood **#C24A40** (lifted for dark) |

Backgrounds are **flat aged paper** — no gradients, no glow, no mesh. The texture lives in the *type and the rules*, not in effects.

> **Both modes are fully realised as kits:** `Nvexis-Editorial-Identity.html` (Day / light) and `Nvexis-Editorial-Identity-Dark.html` (Night / dark). The Night kit also documents **surface elevation** (depth via hairline + lift, never shadow-soup) and the **Light↔Dark token parity** every app wires into its theme switch.

---

## 3. Colour system

### Palette (every pair WCAG-AA audited)
| Token | Name | Hex (Day) | Hex (Night) | Role |
|---|---|---|---|---|
| `--ox` | Oxblood | `#7A2A26` | `#C24A40` | **The accent.** The mark, links, emphasis, rules. |
| `--ox-bright` | Oxblood Bright | `#9B3A33` | `#D2675C` | Hover; small accent text on dark. |
| `--page` | Parchment / Ink | `#ECE4D6` | `#181210` | Page base. |
| `--surface` | Surface | `#F4EEE2` | `#211917` | Cards, raised panels. |
| `--ink` | Ink / Bone | `#221A14` | `#ECE2D2` | Primary text & rules. |
| `--ink2` | Body | `#4A3F35` | `#C7BAA9` | Long-form body text. |
| `--muted` | Umber | `#5E5346` | `#9E9082` | Captions, datelines, folios. |
| `--hair` | Hairline | `#CDBFA8` | `#352724` | Rules, dividers, borders. |
| `--gilt` | Gilt | `#8A6A2E` | `#C7A24E` | **Rare.** Hairline flourishes / foil only — never body text. |
| `--signal` | Signal | `#B23A2E` | `#D8634A` | Genuine loss / risk only (use rarely). |

### Measured contrast (the receipts)
Day, on parchment: Ink **13.6 : 1** · Body **8.1 : 1** · Umber **5.9 : 1** · Oxblood **7.6 : 1**. Night holds too (Bone **14.5 : 1**; oxblood lifted to `#C24A40`). **Nothing ships under AA (4.5 : 1) for text.**

### Colour psychology (the *why*)
- **Oxblood:** the ink of old ledgers and bound almanacs — value, seriousness, permanence. Deep enough never to read "hype red," and distinct from fintech-green and AI-violet alike. It is the brand's single guiding mark.
- **Parchment & ink:** aged paper and printer's ink — calm, credible, made to last. Cooler and more serious than Claude's cream.
- **Restraint is the luxury.** Oxblood earns attention because it is the only chroma in the room.

### The 60 / 35 / 5 rule
~60% parchment, ~35% ink/structure, ~5% oxblood. **One accent moment per view.**

### Accessibility (target WCAG AA)
- Body copy uses **`--ink2`**, never `--muted` — *that was the old contrast bug (muted fell to ~4.4 : 1 on parchment).* Captions/datelines may use `--muted` (still ≥ 5.9 : 1).
- **Oxblood button:** Day = oxblood fill + `#F7F1E6` text (8.5 : 1). Night = deepen the fill to **`#8E332D`** + `#F7F1E6` (5.9 : 1) so the label keeps contrast.
- On dark, small oxblood *text/links* use `--ox-bright #D2675C`; the `#C24A40` accent is for the mark, rules and large headings.
- Gilt is decorative / large only — never small text.

---

## 4. Typography

Distinctive, free (Google Fonts), and deliberately **not Inter**. The serif is the signature.

| Role | Font | Use |
|---|---|---|
| **Display / headlines** | **Fraunces** (900; italic for pull-quotes) | Headlines, hero, wordmark. An "old-style" display serif — characterful, warm, authoritative. The signature. |
| **Body / long-form** | **Spectral** (400/500/600) | All reading text, ledes, captions. A screen-true serif built for long form. |
| **Figures / data** | **IBM Plex Mono** (500) | Numbers, prices, %, datelines, folios, eyebrows. The "instrument" texture. |

### Type scale (big jumps, no in-betweens)
| Step | Size (px) | Font / weight |
|---|---|---|
| Display | 58–128 (clamp) | Fraunces 900 |
| H1 | 44 | Fraunces 900 |
| H2 | 30 | Fraunces 900 |
| H3 | 21 | Fraunces 600 / 900 |
| Lede | 20–21 | Spectral 400 italic |
| Body | 17 | Spectral 400 |
| Small | 14 | Spectral 400 / 500 |
| Eyebrow / folio | 11.5 | IBM Plex Mono 600, UPPERCASE, +0.22em |
| Figure | varies | IBM Plex Mono |

### Rules
- **Fraunces headline + Spectral body** — never mix up. Headlines big, tight (`-.018em`), confident.
- **The editorial details are the brand:** drop caps lead features; **small caps** open sections; **oldstyle figures** (`font-feature-settings:"onum"`) sit inside prose; lining mono figures handle data tables and stats.
- Mono for *every* number that matters (prices, %, subscriber counts) — a brand signature kept from before.
- Eyebrows (tiny uppercase mono, often oxblood) above headlines = the editorial polish.
- Sentence case for UI; headline/title case for article titles. ALL CAPS only for eyebrows / folios.

---

## 5. Layout, grid & the editorial details

- **12-column grid**, generous margins (72–96px desktop), 24px gutter.
- **Spacing scale (8px base):** 4, 8, 12, 16, 24, 32, 48, 64, 96. Only these.
- **Rules & folios:** thin hairlines, **double-rules** under mastheads, and small mono **folios** (`PG. 01`, `No. 001`, `Vol. I`) give the publication feel.
- **Fleurons:** the oxblood star, centred between two hairlines, is the section break — a printer's flower. Use it to separate movements; keep it restrained.
- **Leader dots** for contents lists (title … page). **Drop caps** to open features. **Pull-quotes** in Fraunces italic.
- **Whitespace first.** Calm and spacious = premium. One focal point per screen: eyebrow → headline → lede → body → action.
- Backgrounds: **flat parchment / ink** — never a gradient or glow.

---

## 6. Logo & motifs

- **The mark — the Nvexis prism:** a **faceted gem whose three planes converge to a single apex** — *nexus* (paths meeting) + *vertex* (the point), the meaning of the name made visible. Day: three oxblood facet-tones (`#5E211E` / `#7A2A26` / `#A0453B`) on parchment. Night: brighter oxblood with a bone facet (`#9A3A34` / `#C24A40` / `#ECE2D2`) on ink. Mono: single-ink line-art (outline + three facet edges). Keep the geometry fixed; never re-tint outside the oxblood family. *(Introduced 5 Jul 2026 with the Lodestar to Nvexis rename; replaced the four-point star.)*
- **Clear space:** equal to the gem's half-height on all sides. **Min size:** 16px (use the `nvexis-favicon` variant below 24px).
- **Wordmark:** "Nvexis" in **Fraunces 900**, tight tracking. The prism leads the word or stands alone.
- **Facet as fleuron:** a single cropped facet-triangle, small, as a section divider and recurring motif (mastheads, dividers, social).
- **Logo files (ready):** `Nvexis Rebrand/Editorial Authority/logo/` — day, night, mono ink, reverse/parchment, app-icon tiles, favicon, wordmark lockup.
- **Imagery:** duotone (ink × oxblood) or high-contrast mono. No generic stock realism.
- **Banned:** spring-green / neon, gold-or-foil-as-primary, navy/blue, violet, glassmorphism, gradients/glow, drop-shadow soup, Inter, the four-point AI sparkle.

---

## 7. Components (both modes)

- **Primary button:** oxblood fill + `#F7F1E6` text (Night fill deepens to `#8E332D`), `border-radius: 2px`, generous padding. One per view.
- **Secondary (ghost):** transparent, 1px border in `--ink`; on hover, fills ink with parchment text.
- **Cards:** surface colour, 1px hairline, `border-radius: 4px`, 24–28px padding, flat. Optional masthead double-rule for "issues."
- **Tags / pills:** small mono uppercase; oxblood text on a hairline border.
- **Data / figures:** IBM Plex Mono; oxblood for emphasis, `--signal` only for genuine loss / risk.

### Web/app vs social
- **Web & app UIs:** full system, both modes, rules, folios, fleurons. Flat paper.
- **Social posts:** flat, bold, high-contrast. Huge Fraunces headline, one oxblood moment, the star, big margins. Alternate Day/Night by pillar for recognisability:
  - Markets & Money → Day (parchment), oxblood accent
  - Mind & Psychology → Night (ink), oxblood accent
  - AI & Leverage → Night (ink), bone + oxblood
  - Sectors & Signals → Day (parchment), ink + oxblood

---

## 8. Voice ↔ visual alignment
- *Engineer / systems* → the grid, mono figures, precise rules.
- *Honest / anti-guru* → no hype, no gloss, no gold; an edited page that respects the reader.
- *Calm, quiet confidence* → parchment, whitespace, one oxblood accent.
- *Depth / earned mastery* → the almanac, the serifs, the folios — a publication you return to.

---

## 9. Consistency rules (every project follows)

This file lives in every Nvexis-brand folder. Whatever you build — CO-CE outputs, Cairn, Aurora, Fintrack, the websites, the newsletter, slides, Discord branding — pulls from these exact tokens:

1. **Only** the palette in §3 (exact hex), both Day + Night.
2. **Only** Fraunces (display) + Spectral (body) + IBM Plex Mono (figures). Never Inter.
3. The **8px spacing scale** and the **type scale** — no arbitrary values.
4. **60 / 35 / 5**; one oxblood moment per view; both modes supported.
5. **No** spring-green / gold / neon / navy / violet / glass / gradient / Inter / AI-sparkle.
6. Body text uses **`--ink2`**, not `--muted` (the audited contrast rule).
7. When unsure, choose the more **spacious, more precise** option — and let the work talk.

> Feed these tokens into CO-CE's Design Director and every app's stylesheet. Consistency compounds recognition into trust.

---

## 10. Quick-reference tokens (for devs / CO-CE)

```css
:root{ /* DAY — parchment (hero) */
  --page:#ECE4D6; --surface:#F4EEE2; --ink:#221A14; --ink2:#4A3F35;
  --muted:#5E5346; --hair:#CDBFA8; --ox:#7A2A26; --ox-bright:#9B3A33;
  --on-ox:#F7F1E6; --gilt:#8A6A2E; --signal:#B23A2E;
  --font-disp:'Fraunces',Georgia,serif;
  --font-body:'Spectral',Georgia,serif;
  --font-mono:'IBM Plex Mono',ui-monospace,monospace;
  --radius:2px; --radius-card:4px; --space:8px; /* 4 8 12 16 24 32 48 64 96 */
}
.night, [data-mode="night"]{ /* NIGHT — ink */
  --page:#181210; --surface:#211917; --ink:#ECE2D2; --ink2:#C7BAA9;
  --muted:#9E9082; --hair:#352724; --ox:#C24A40; --ox-bright:#D2675C;
  --on-ox:#1A0E0C; --btn-bg:#8E332D; --gilt:#C7A24E;
}
```
Fonts (free): `fonts.google.com/specimen/Fraunces`, `/Spectral`, `/IBM+Plex+Mono`.
Living reference — **two kit pages**: `Nvexis-Editorial-Identity.html` (Day / light) + `Nvexis-Editorial-Identity-Dark.html` (Night / dark, incl. elevation + Light↔Dark parity), plus `logo/` — all in `Nvexis Rebrand/Editorial Authority/`.

---

*If a decision isn't covered here, ask: "What would a serious almanac — edited, set in metal type, made to last — do?" — then do that. Two inks, one paper, the nvexis, lots of space.*
