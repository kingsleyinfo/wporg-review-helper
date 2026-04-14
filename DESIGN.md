# Design System — WPorg Review Helper

Visual vocabulary for the Tampermonkey userscript overlay on wordpress.org.

## Color Palette

### Core
| Token | Value | Usage |
|-------|-------|-------|
| `--wrh-dark` | `#23282d` | FAB background, primary dark |
| `--wrh-accent` | `#0073aa` | Primary buttons, links, hover states |
| `--wrh-accent-hover` | `#005a87` | Button hover, link hover |
| `--wrh-secondary` | `#50575e` | Settings FAB, secondary buttons |
| `--wrh-text` | `#1e1e1e` | Primary text, headings |
| `--wrh-text-secondary` | `#3c434a` | Signal text, table cells |
| `--wrh-text-muted` | `#757575` | Labels, hints, descriptions |
| `--wrh-text-faint` | `#a0a5aa` | Footer, empty states |

### Sentiment
| Token | Background | Text | Border |
|-------|-----------|------|--------|
| Good | `#edfcf2` | `#0a7b3e` | `#b8e6cc` |
| Neutral/Amber | `#fffbeb` | `#92400e` | `#fde68a` |
| Bad/Error | `#fef2f2` | `#b91c1c` | `#f5c6c6` |
| Info | `#f0f6fc` | `#1e1e1e` | `#c8d6e5` |

### Surface
| Token | Value | Usage |
|-------|-------|-------|
| `--wrh-surface` | `#fff` | Panel background |
| `--wrh-surface-muted` | `#f6f7f7` | Template cards, stats cards |
| `--wrh-surface-tinted` | `#f6f8fa` | Draft section (v3.0) |
| `--wrh-border` | `#e2e4e7` | Dividers, card borders, panel header |
| `--wrh-border-input` | `#c3c4c7` | Input borders, secondary button borders |

## Typography

**Font stack:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif`

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Panel header (h2) | 17px | 600 | `--wrh-text` |
| Sentiment badge | 15px | 600 | sentiment color |
| Template card title (h3) | 14px | 600 | `--wrh-text` |
| FAB text | 14px | — | white |
| Body / textarea | 14px | — | `--wrh-text` |
| Section label (.wrh-label) | 11px | 600 | `--wrh-text-muted` |
| Hints, descriptions | 12px | — | `--wrh-text-muted` |
| Signal text | 13px | — | `--wrh-text-secondary` |
| Footer (.wrh-powered-by) | 11px | — | `--wrh-text-faint` |

Monospace font for API key input: `monospace`

## Spacing

**Padding scale:** 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 22px

| Context | Value |
|---------|-------|
| Panel body padding | 22px |
| Panel header padding | 18px 22px |
| Banner padding | 10px 14px |
| Card padding | 14px 16px |
| Button padding | 8px 16px |
| Button padding (large/save) | 10px 20px |
| Section bottom margin | 18px |

## Border Radius Scale

| Size | Value | Usage |
|------|-------|-------|
| xs | 3px | Confidence bar fill |
| sm | 4px | Close button hover |
| md | 6px | Buttons, inputs |
| lg | 8px | Banners, badges, cards, stats |
| xl | 12px | Panel |
| pill | 50px | FABs |

## Component Patterns

### Info Banner (4 variants)
```
background: {sentiment-bg}; border: 1px solid {sentiment-border};
border-radius: 8px; padding: 10px 14px; font-size: 13px;
display: flex; align-items: center; gap: 8px;
```
Variants: good (green), neutral/amber, bad/error (red), info (blue).

### Sentiment Badge
`.wrh-sentiment` — inline-flex, gap: 8px, padding: 10px 16px, border-radius: 8px.
Classes: `.good`, `.bad`, `.neutral`, `.inconclusive`.

### Template Card
`.wrh-template-card` — background: `--wrh-surface-muted`, border: 1px solid `--wrh-border`, border-radius: 8px.
Contains: h3 (title) + p (description) + `.wrh-copy-btn`.

### Copy Button
`.wrh-copy-btn` — primary blue, border-radius: 6px, padding: 8px 16px.
States: default (blue), hover (darker blue), copied (green, 2s timeout).

### Overlay / Modal
`#wrh-overlay` — fixed inset 0, backdrop `rgba(0,0,0,0.4)`, flex centered.
`#wrh-panel` — white, border-radius: 12px, width: 560px, max-width: 92vw, max-height: 85vh, overflow-y: auto.
Animation: fadeIn (overlay) + slideUp (panel).

### FAB (Floating Action Button)
`#wrh-fab` — fixed bottom-right, pill shape (50px radius), shadow.
Hover: accent blue + translateY(-2px).

### Section Label
`.wrh-label` — 11px uppercase, letter-spacing: 0.5px, weight: 600, muted color.

### Copy Feedback Pattern
On copy: text changes to "Copied!" + `.copied` class (green bg). Reverts after 2 seconds.

## New in v3.0

### Draft Section (tinted)
Background: `#f6f8fa`, border-radius: 8px, padding: 16px.
Visually distinct from template cards. Contains textarea + copy button.

### Textarea
6 rows, resize: vertical, width: 100%, font-size: 14px, font-family: inherit.
padding: 12px, border: 1px solid `--wrh-border-input`, border-radius: 6px.
`aria-label="AI-drafted review request message"`.

### Loading Skeleton
Centered text "Analyzing thread... this takes 5-15 seconds" with CSS pulse animation.
Panel opens immediately, fills when data arrives.

### Collapsed Toggle
Amber banner style + "Show draft anyway ▸" text link.
Click expands with CSS transition (max-height + opacity).

### Placeholder Warning
Small amber text below textarea: "Draft contains [REVIEW_LINK] placeholder."
Only shown when unresolved placeholders detected in textarea value.
