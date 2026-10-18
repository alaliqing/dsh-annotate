---
version: alpha
name: "dsh-annotate"
description: "A quiet annotation layer that keeps the developer's page in view."
colors:
  primary: "#252525"
  surface: "#ffffff"
  field: "#f5f5f5"
  muted: "#747474"
  border: "#e3e3e3"
  marker: "#f0a05a"
  markerInk: "#8b5529"
  focus: "#438bbf"
  darkInk: "#ededed"
  darkSurface: "#242424"
  darkField: "#303030"
  darkMuted: "#a4a4a4"
  darkBorder: "#444444"
typography:
  sans:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif'
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
rounded:
  DEFAULT: "7px"
  card: "14px"
  popover: "12px"
  batch: "24px"
spacing:
  toolbar-height: "48px"
  control-size: "32px"
  card-width: "294px"
components:
  button: {}
  card: {}
  popover: {}
  annotation-list: {}
  input: {}
---

# dsh-annotate Design System

## Overview

### Creative North Star

Codex browser annotations: a small note beside the element, with the page remaining the main surface. The user approved the minimal v2 prototype on 2026-10-18.

### Product context and register

- Audience and primary job: developers reviewing a local page and sending precise element feedback to their Harness conversation.
- Target market and evidence: existing DSH users; no new geographic market claim. See README.md and CONTRIBUTING.md for runtime boundaries.
- Locales: English and Simplified Chinese, owned by src/i18n.js; the language action names its target language.
- Usage scene: desktop side panel, frequently 320–560 CSS px wide. Product register: compact utility.
- Memorable signature: warm numbered markers; monochrome round save/send actions.
- Restraint: a single toolbar, on-demand list, optional technical details.
- Anti-references: dashboard tabs, permanent review sidebars, glass panels and decorative animations obscure the page.
- Token ownership: packages/dsh-annotate/src/theme.js is canonical. build.mjs embeds it in both runtimes. This document mirrors it; client.js maps Harness semantic aliases to panel variables, while overlay.js uses the shared light/dark palettes inside the isolated preview. npm run check regenerates lib/.

## Colors

Neutral opaque surfaces and hairline separators. Amber identifies selected elements and numbered pins, not the primary action. Panel surfaces follow Harness label/background aliases; isolated overlays select the shared palette from the page luminance. Focus uses a visible ring. Dark text and muted text follow the palette above.

## Typography

System UI at 13px with Chinese-capable fallbacks; comments use 1.7 line height. Technical selectors and addresses use monospace at 10–11px. Annotation body comes before the target name. Long comments wrap; target details can be disclosed. No custom font download.

## Layout

48px top toolbar: services, flexible address/reload, Mark, More. Preview fills all remaining height. Bottom batch pill and its list float over the preview without resizing it. Batch pill exists only for saved notes or a real changed draft. At panel widths below 380px the Mark text hides while its accessible name remains. The 294px card is clamped to the viewport, with bounded height and internal scroll. Width selection is a native select because platform-owned options are appropriate for this short list.

## Elevation & Depth

Opaque surfaces, one border, restrained shadow only for floating cards/popovers. No blur or gradient. Preview and toolbar have no decorative elevation.

## Shapes

7px controls, 12px popovers, 14px note cards. Save/send actions and numbered markers are circles. Marker visuals are 20px inside a 32px pointer target.

## Components

### Foundational visual states

Hover uses a faint neutral fill; keyboard focus has a visible ring. Pressed Mark uses neutral fill and aria-pressed. Disabled actions retain their geometry. Busy sends are disabled with an animated ellipsis; reduced motion disables animation. Loading and unavailable preview states retain the toolbar and offer retry. Errors stay visible with retry; reversible deletion offers Undo.

### Buttons and actions

Primary save/send is a round monochrome arrow. All icon-only actions have localized accessible names. Mark is a labeled toolbar action; history, width, language, external browser and help live in More. Add to composer is a secondary send option. Deletion is reversible and has no confirmation dialog.

### Navigation and data display

The right sidebar owns the single Annotations entry: a compact comment icon, a short title and one-line description, rendered by the host. No duplicate conversation-header action. The keyboard shortcut remains available.

The count opens a compact list over the preview. The comment body is primary and the human-readable target is secondary. Clicking a list row or numbered pin opens read-only text. The text stays unfocused on open; clicking or tabbing into it activates editing in place, without a separate Edit button. Session and full URL are the storage boundary; SPA navigation preserves form state and restores that route's notes.

### Forms and overlays

Cards are non-modal regions, with no focus trap. Editing focuses the textarea. Enter saves and continues marking; Shift+Enter inserts a newline; IME Enter does not save. Esc and outside clicks close the card: unchanged content creates no draft, real changes remain resumable. Cancel discards changes. Only one changed draft per URL is supported; a second edit first asks the user to finish or discard it. Target details disclose the selector. Sending blocks while an existing saved note has pending changes. Failed sends preserve annotations and unrelated composer text.

### Iconography

Small inline SVG icons, consistent currentColor strokes/fills. Numbered pins use text. No external icon dependency.

### Motion

Brief marker feedback and busy ellipsis communicate state. Layout remains stable; prefers-reduced-motion removes transitions and animation.

### Content and data visualization

Direct bilingual verbs. No success dialog. Technical context stays behind the target disclosure; submitted payload leads with the full note and one locator line. The full URL appears once per batch. Computed styles and component chains are omitted; uncertain selectors add an explicit verification prompt and available fallback hints. No charts.

## Do's and Don'ts

- Do keep the page visible throughout marking and review.
- Do distinguish saved notes, read-only views and actually changed drafts.
- Don't enter edit mode just because a saved annotation was opened.
- Don't add permanent footers, redundant tabs or technical metadata to the main note body.
