---
name: Piccolo Museo della Tavola Periodica "Primo Levi"
description: A dark museum vitrine for real chemical specimens, lit only by the object and by the colour of its element family.
colors:
  void: "#03030A"
  void-deep: "#02020E"
  void-raised: "#07071A"
  vitrine: "#06060E"
  modal-glass: "#04040C"
  stroke: "#2A2A44"
  ink: "#E8E8F0"
  ink-muted: "#72728A"
  lamp-ivory: "#E8E4D8"
  lamp-cool: "#A8CEFF"
  lamp-violet: "#8C5CFF"
  lamp-indigo: "#3A2296"
  cat-alkali: "#FF6B35"
  cat-alkaline: "#FFA94D"
  cat-transition: "#38A1FF"
  cat-postmetal: "#74C0FC"
  cat-metalloid: "#69DB7C"
  cat-nonmetal: "#FFE066"
  cat-halogen: "#E1705A"
  cat-noble: "#CC5DE8"
  cat-lanthanide: "#F783AC"
  cat-actinide: "#E64980"
  focus-ring: "#82B4FF"
  daylight-bg: "#F2F2F6"
  daylight-ink: "#0E0E20"
  daylight-muted: "#4E4E68"
  daylight-stroke: "#C2C2D8"
  paper-bg: "#F5F2EC"
  paper-ink: "#111313"
  olive-accent: "#6B7240"
  mobile-accent: "#4A9EFF"
typography:
  display:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-2px"
  headline:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.2px"
  title:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.5px"
  body:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "0.90625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.65625rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.15px"
  label-caps:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "2px"
  cell-symbol:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.1px"
  symbol-display:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "4.75rem"
    fontWeight: 800
    lineHeight: 0.85
    letterSpacing: "-5px"
  symbol-hero:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "6.75rem"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-6px"
  symbol-medium:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 1
  symbol-card:
    fontFamily: "Fira Code, monospace"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0"
  name-it:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.3px"
  name-en:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.2
  atomic-number:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.2px"
  data-value:
    fontFamily: "Fira Code, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  cell: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  card-paper: "14px"
  pill: "999px"
  round: "50%"
spacing:
  cell-gap: "4px"
  chip-gap: "6px"
  chip-x: "12px"
  chip-y: "5px"
  modal-pad: "16px"
  topbar-x: "30px"
  tap-target: "44px"
components:
  cell:
    backgroundColor: "{colors.vitrine}"
    textColor: "{colors.ink}"
    typography: "{typography.cell-symbol}"
    rounded: "{rounded.cell}"
  chip:
    backgroundColor: "rgba(255,255,255,0.028)"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  chip-active:
    backgroundColor: "rgba(255,255,255,0.90)"
    textColor: "#000000"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  modal-card:
    backgroundColor: "{colors.modal-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  modal-back-button:
    backgroundColor: "rgba(255,255,255,0.90)"
    textColor: "#000000"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
  side-dock-trigger:
    backgroundColor: "rgba(8,10,20,0.94)"
    textColor: "rgba(255,255,255,0.62)"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: "20px 9px"
  compare-tray:
    backgroundColor: "{colors.vitrine}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px 20px 18px"
---

# Design System: Piccolo Museo della Tavola Periodica "Primo Levi"

## Overview

**Creative North Star: "La teca al buio" (The Dark Vitrine)**

The whole museum is a display case seen in a darkened room. The ground is near-black indigo, and nothing on it competes with the specimen: the photograph or the 360-degree video of the real object is the brightest thing on any screen, and the interface is the glass, the label and the lamp around it. Colour is never a fill. It arrives as a family-coloured glow around a specimen, a tinted border, a light-source slider that moves from warm ivory to UV violet. The same logic runs through the periodic table, the labs (atoms, orbitals, spectra, decay chains) and the glass wall.

The system reads like an instrument panel in a museum: Syne carries the Italian element name and the large symbol with heavy weight and tight tracking, Fira Code carries the English name, atomic number, mass, captions and control labels, and hairline borders separate surfaces instead of shadows. Yet it stays playful under the finger. Cells spring in on a stagger, zoom on hover, and modals settle with a slight overshoot. The tone is dark and luminous, precise and quiet, and lively at the touch.

The shipped system rejects, by how it is built today: a white-cube gallery look (the base is always dark, and the light theme is a secondary mode); solid category fills, since category colour only tints and glows; and decorative illustration, since every picture is a real specimen. These are read from the incumbent CSS, and the user delegated them to this document, so treat them as descriptions of the current system rather than new rules.

**Key Characteristics:**
- Near-black ground with two slow aurora washes (blue, purple) and a faint dot grid; colour only as glow.
- Ten element-family colours, used as 12-16% tints, 36-42% borders and hover glows.
- Two typefaces only: Syne (Italian names, large symbols, headlines) and Fira Code (English names, atomic numbers, masses, compact symbols, captions, controls).
- Active and hover states invert to a near-white pill with black text.
- Ghosted oversized Syne text (white at about 24-26%) as watermark: hovered element name, series labels, atomic numbers.
- Whole-screen layouts sized to the viewport (no page scroll on the table), scaled by `vmin` so text tracks physical screen size on a totem or a phone.

## Colors

A near-black indigo stage lit by ten glowing family colours and one warm lamp.

### Primary
- **Stage Void** (#03030A): the base of the periodic table, labs and mobile. Fixed background under the aurora layers.
- **Vitrine Black** (#06060E): the surface of a cell and of floating trays. A hair lighter than the stage so a case reads as an object.
- **Modal Glass** (#04040C): the modal card behind a 0.88-black backdrop blurred by 18px.
- **Instrument Void** (#02020E): the ground of the 3D atom and orbital viewer.

### Secondary (element families, one per category)
- **Alkali Ember** (#FF6B35), **Alkaline Amber** (#FFA94D), **Transition Blue** (#38A1FF), **Post-metal Sky** (#74C0FC), **Metalloid Green** (#69DB7C), **Nonmetal Yellow** (#FFE066), **Halogen Coral** (#E1705A), **Noble Violet** (#CC5DE8), **Lanthanide Rose** (#F783AC), **Actinide Magenta** (#E64980). Each identifies a family on the table, on timeline cards (top border) and on the legend. The blue, green, yellow, red order also serves the property heat scale.

### Tertiary (the lamp)
- **Lamp Ivory** (#E8E4D8): the glass wall's default light and its accent for names, active state and thumb.
- **Lamp Cool** (#A8CEFF), **Lamp Violet** (#8C5CFF), **Lamp Indigo** (#3A2296): the further stops of the light-source rail, ending in the darkest UV tone.
- **Focus Ring Blue** (#82B4FF): keyboard focus on a cell, drawn as a 3px ring plus a thin dark inner ring.

### Neutral
- **Ink** (#E8E8F0): primary text on the stage.
- **Ink Muted** (#72728A): secondary text and subtitles. It reaches 4.4:1 on the stage, which is just under AA for small text (see Do's and Don'ts).
- **Stage Stroke** (#2A2A44): the default 2px cell border and 1px surface border.
- **Hairline** (rgba(255,255,255,0.16)): borders on the glass wall and on modals.
- **Daylight** (#F2F2F6 ground, #0E0E20 ink, #4E4E68 muted, #C2C2D8 stroke): the light theme, a toggled mode of the same table; category tints are re-mixed lighter on white.

### Variants outside the base system
- **Paper** (#F5F2EC ground, #111313 ink, olive #6B7240 accent): the legacy gallery grid (`gallery.html`), warm and light. It is a divergent variant and not a rule for new work.
- **Mobile Blue** (#4A9EFF): the accent of `mobile.html`; the rest of the mobile palette follows the dark stage.

### Named Rules
**The Glow-Not-Fill Rule.** Family colour is a tinted gradient (12-16% at the top corner fading to 3-5%), a 36-42% border, and a glow on hover. Never a solid fill, and never as text on a light panel.
**The One Lamp Rule.** On the glass wall a single lamp drives the whole scene. Its colour (ivory to UV) is the only accent on screen; do not add a second accent beside it.
**The Object Is Brightest Rule.** Nothing on a screen may out-shine the specimen. The one near-white element is the active control pill.

## Typography

**Display Font:** Syne (with system-ui, sans-serif)
**Body Font:** Syne
**Label/Mono Font:** Fira Code (with monospace)

**Character:** Syne is wide, heavy and slightly eccentric, used at 700-800 with negative tracking so names and big symbols look carved. Fira Code is the instrument voice: small, tabular, the language of numbers, captions and secondary identity. The pairing is identity against reading: what the thing is called in Syne, what is measured or noted about it in Fira Code.

The root size is `clamp(14px, calc(0.6vmin + 11.5px), 26px)` so every rem tracks the physical screen. All sizes are in rem.

### Hierarchy
- **Display** (800, 2.75rem, 1, -2px tracking): the hovered element name over the table, drawn as a ghost (white at about 26%) with a moving shine. The lamp name on the glass wall uses the same idea (800, `clamp(22px, 15cqmin, 60px)`, -0.035em).
- **Headline** (800, 1.375rem, 1.25): the modal title, an element name or sample title.
- **Title** (700, 1.1875rem, 1.25, -0.5px): the site title, with an italic 600 emphasis in a 62% white.
- **Body** (400, 0.90625rem, 1.6): sample and element descriptions, set in italic under a small "Scheda" label. Keep lines to 65-75ch.
- **Label** (Fira Code 400, 0.65625rem, 0.15px): chips, subtitles, compare rows, captions.
- **Label Caps** (Fira Code 700, 0.75rem, 2px tracking, uppercase): the vertical side-dock triggers and small section labels.
- **Cell Symbol** (Fira Code 500, 0.9375rem): the symbol at the bottom-right of a cell, with the atomic number (Fira Code 700, 0.625rem) at the top-left.

### Element Identity

An element is presented through five pieces of text, and each has one fixed voice. The split is by role, not by page: the same element wears the same fonts in the table, the popup, the labs and the mobile card.

- **Italian name** is the element's name and always Syne, bold: 700 in the popup panel (1.0625rem, -0.3px), the gallery (1.25rem, -0.4px, 85% white) and the timeline detail (1.1875rem, 95% white); 800 as the modal title (1.375rem) and as the ghosted hover name over the table (2.75rem, -2px). Timeline card labels are the small exception: Syne 600, 0.53125rem, uppercase, 0.4px tracking, 44% white.
- **English name** is secondary identity and always Fira Code, small and dimmed: 0.625rem, weight 400, 50% white under the Italian name in the popup, and 11px at 38% on the mobile card. It never appears larger than the Italian name.
- **Symbol** has two registers. **Large or identity symbol: Syne 800 with tight negative tracking.** Popup panel 4.75rem (-5px, line-height 0.85, white with a faint blue halo); gallery hero 6.75rem (-6px, white with a wide soft glow); timeline detail 2.75rem, coloured with the family colour and a 50% family glow; compare tray 1.125rem; mobile card header as a 140px faded watermark. **Compact symbol: Fira Code.** In the table cell (500, 0.9375rem, bottom-right, white with a black text shadow, and on hover it glides to the cell centre and grows to 1.75 times its size), on timeline cards (600, 1.375rem, 92% white), and in flame tags (0.5625rem).
- **Atomic number** is always Fira Code and always small: 0.625rem, weight 700, top-left of a cell; 0.75rem at 40% white in the timeline detail; 0.8125rem at 50% white as an inline "(Z=35)" after the name in the gallery; prefixed "Z = " at 11px with 1px tracking on the mobile card. It is never Syne. A very large atomic number may exist only as a faded watermark in Syne 800 (60px on gallery cards).
- **Mass, year and other measured values** are Fira Code: 0.8125rem for the atomic mass, tabular figures for values in the compare tray, and a 2.375rem bold Fira Code year on the timeline. Sample names in the specimen callout are Fira Code as well (0.6875rem).

Colour on identity text follows the same restraint as everywhere else: white or 85-95% white by default, the family colour only for the symbol in the timeline detail, and 26% white ghosting for watermark names.

### Named Rules
**The Identity-Vs-Measure Rule.** Syne says what a thing is called (Italian name, large symbol, headline). Fira Code says what is known about it (English name, atomic number, mass, year, caption, control label). The atomic number and the English name are never set in Syne, and the Italian name is never set in Fira Code.
**The Two-Registers Rule for Symbols.** A symbol that is the subject of a panel (popup, gallery, timeline detail, compare header, mobile card) is Syne 800 with negative tracking. A symbol that is a label inside a small tile (table cell, timeline card, flame tag) is Fira Code at 500-600, so it stays legible over a photo. Choose by role, not by size: the timeline card's 1.375rem symbol is still Fira Code.
**The Ghost Text Rule.** Very large Syne 800 at 24-26% white marks series and states (Lanthanides, hover name, filter name). Ghost text is never the only carrier of essential information.

## Layout

The periodic table is a fixed 18 by 9 grid (seven periods, a 16px separator row, two f-block rows) of square cells. The cell size is the smaller of "as wide as the container allows" and "as tall as it allows", computed with container query units, so the table fits entirely inside the viewport on any aspect ratio and never scrolls (`body` is `100dvh`, `overflow: hidden`). Gaps are 4px on desktop, dropping to 3px and 2px on smaller screens. A 56px pad on each side keeps the grid clear of the fixed side docks.

Chrome is thin: a topbar (22px 30px 10px) with the title on the left and chips plus the maker logo on the right, a hairline fading in from both ends beneath it, and side docks fixed to the left edge at mid-height. Full-screen modals are centred cards up to 1200px wide (photo mode: 97vw by 97vh, up to 2400px). The glass wall is a full-bleed wall of flush tiles with a floating lamp panel; the object sheet is a two-column layout, stage plus a panel of `min(38vw, 520px)`. Touch targets on the glass wall are at least 44px, and the mobile variant respects safe-area insets and a 56px header.

Rhythm is compact and instrument-like: 4-6px between controls, 12-16px inside panels, 30px at the page edge.

## Elevation & Depth

Depth is conveyed by tonal layering and glow, not by soft grey shadows. Surfaces are a few percent lighter than the ground, separated by hairline borders, and lifted over a heavy black shadow only when they float (modals, trays, hovered cells). Frosted glass (backdrop blur 10-22px with saturation boost) marks anything that floats over live content.

### Shadow Vocabulary
- **Base shadow** (`box-shadow: 0 8px 32px rgba(0,0,0,0.80)`): default lift on the dark stage.
- **Cell hover** (`0 0 32px <family .30>, 0 0 8px <family .20>, 0 16px 40px rgba(0,0,0,.88)`): the specimen's family glow plus a heavy black drop.
- **Modal** (`0 0 0 1px rgba(255,255,255,0.035) inset, 0 48px 120px rgba(0,0,0,.90)`): the deep well of a full-screen card, topped by a 1px shimmer line.
- **Tray** (`0 20px 50px rgba(0,0,0,0.55)`): the compare tray.
- **Focus** (`0 0 0 3px rgba(130,180,255,0.9), 0 0 0 1px rgba(8,10,20,0.85)`): keyboard focus on clipped cells, where an outline would be cut off.

### Named Rules
**The Glow Carries Colour Rule.** Colour depth comes from a family glow, never from a coloured drop shadow beneath a light surface.
**The Frosted-Only-When-Floating Rule.** Backdrop blur is reserved for surfaces that sit above moving content (modal backdrop, docks, lamp, glass wall caption).

## Shapes

Small, soft-cornered squares and pills. Cells are square with a 6px radius and a 2px border. Pills (999px) are chips, back buttons and badges; circles (50%) are close and remove buttons. Panels step up through 8, 12, 16 and 20px, and side docks are rounded only on the side facing the table (0 14px 14px 0). The glass wall is the exception: its tiles, bar and lamp panel are square-cornered with 1px hairlines, because it is meant to read as a flush wall of glass. Legacy paper cards use 14px.

## Components

### Element Cell (signature)
A square vitrine. Background is Vitrine Black with a top-corner family tint, a 2px family border at 36-42%, a 1px light shimmer along the top edge, the poster photo of the specimen filling the cell, the atomic number top-left (Fira Code 700, 0.625rem) and the symbol bottom-right (Fira Code 500, 0.9375rem) with a black text shadow for legibility over the photo. There is no name in the resting cell: on hover the symbol glides to the centre and grows to 1.75 times its size over a radial black vignette, and the Italian name appears as ghosted Syne 800 text in the empty slot of the grid (with a Fira Code value line under it while a property view is active). It springs in on a stagger (0.4s, `cubic-bezier(0.34, 1.52, 0.64, 1)`, 3.5ms per index). On hover it scales to 1.20 and lifts 1px, the border rises to 82-88% and the family glow blooms. Cells without a video sit at 45% opacity; filtered-out cells drop to 7%. Keyboard focus shows the blue ring described in Elevation.

### Chips and Pills
- **Shape:** full pill (999px), 1px Stage Stroke border, Fira Code 0.65625rem, padding 5px 12px.
- **Default:** near-transparent white (2.8%) with Ink text.
- **Hover / Active:** inverts to 88-90% white with black text and matching border, over 0.14s. Tag chips are muted (70% opacity) and inert.
- **Back button and Close:** the back button is the active pill (white, black text, bold Fira Code); the close is a 28px circle with a 22% white border that inverts to white on hover.

### Modal Card
Modal Glass (#04040C) with a 1px border at 18% white, a 20px radius, the deep modal shadow and a shimmer line on top. Header has a 14% white hairline beneath, a Syne 800 title and the pill on the right. It appears with a 0.26s scale-and-rise (`cubic-bezier(0.34, 1.38, 0.64, 1)`) over a blurred, near-black backdrop. Sample notes sit in an italic block on a 4.5% white band under a small uppercase "Scheda" label.

### Side Docks and Legend
Vertical Fira Code Caps triggers stuck to the left edge, on a 94% near-black background with blur, a hairline border and a 14px right radius. They brighten on hover or focus and their arrow flips when the dock opens. The whole group hides while a modal is open. The legend lists each family with its colour swatch; the active item takes a 6% white background.

### Compare Tray
A floating 16px-radius Vitrine Black panel with blur, centred above the bottom edge, holding a grid of Fira Code rows under Syne 800 symbols. Selected cells show a 15px numbered badge in the focus blue.

### Glass Wall and Lamp (signature)
A flush wall of square tiles on black. Tiles scale by 1.07 on hover with a 2px inset glow in their own colour, and non-matching tiles dim to 16% via a black overlay. A caption appears bottom-up on a black gradient. The lamp is a floating frosted panel whose radial glow follows the position of the light-source thumb along a rail from Lamp Ivory to Lamp Indigo; the thumb is a 28px circle with a pulsing hint ring. Motion uses `cubic-bezier(.22,.9,.2,1)` over 0.7-0.9s, and switches off under `prefers-reduced-motion`.

### Legacy Paper Card (variant)
The `gallery.html` card: 4:3, 14px radius, 1px sage border, soft warm shadow that deepens on hover, a hover video and a bottom label on a black gradient. Keep it only where that page is maintained.

## Do's and Don'ts

### Do:
- **Do** keep the ground at Stage Void (#03030A) or darker and let the specimen photo or video be the brightest surface on screen.
- **Do** express category colour as a 12-16% tint, a 36-42% border and a hover glow (The Glow-Not-Fill Rule).
- **Do** follow the Identity-Vs-Measure Rule: Syne for the Italian name, large symbols and headlines; Fira Code for the English name, atomic number, mass, compact symbols, captions and controls (see Element Identity).
- **Do** invert active and hover chips to the 90% white pill with black text.
- **Do** size touch targets to at least 44px on touch-first surfaces, and keep tap areas visible on the glass wall.
- **Do** give every animation a `prefers-reduced-motion` fallback. Only `vetri.css` has one today; the periodic table's entry, hover and modal animations do not.
- **Do** verify text contrast against the WCAG 2.1 AA target in PRODUCT.md, especially for small Fira Code captions over photos (they rely on a black text shadow).

### Don't:
- **Don't** use a solid family colour as a background or a coloured text on a light panel.
- **Don't** add a second accent next to the lamp on the glass wall.
- **Don't** put Ink Muted (#72728A, 4.4:1 on the stage) on essential text under 18px; lighten it or size it up first.
- **Don't** use ghost text (24-26% white) as the only carrier of information; it is decoration and a wayfinding hint.
- **Don't** reach for stock illustration, cartoon icons or decorative gradients; every image is a real specimen.
- **Don't** mix radius families on one surface: pills for controls, 6-20px for panels, square corners on the glass wall.
- **Don't** build on the warm paper gallery palette for new pages; the dark stage is the base.
