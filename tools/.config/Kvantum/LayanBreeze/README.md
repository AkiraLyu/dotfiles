# Layan Breeze

`LayanBreeze` combines the light and dark palettes and translucency of the
locally installed Layan Kvantum theme with the widget geometry and interaction
model of KDE Breeze 6.7.4.

The geometry values are derived from KDE Breeze 6.7.4's `breezemetrics.h`: 6 px
layout spacing, 10 px dialog margins, 84×34 px rendered command buttons (the
80 px Breeze minimum plus its frame), 20 px checks and slider handles, 21 px
scroll bars, 6 px progress and slider grooves, 30 px tabs, a 24 px internal MDI
title bar, and 1 px visual outlines. Toolbar frame width, item margin, spacing,
and handle extent resolve to Breeze's 0, 6, 0, and 10 px respectively.

The light window/menu and dark window/menu artwork retains Layan's 80% opacity;
tooltips also retain Layan's 80% opacity. Blur remains enabled.

Command buttons use a dedicated Breeze-style nine-slice frame with 5 px corner
radii, a single-pixel outline, and a subtle two-stage bottom shadow. The pressed
state removes the shadow, while hover, focus, default, and toggled states keep
Layan's fills and purple accent. Compensating content margins preserve the
84×34 px widget metric despite the larger visual corner slices. Combo boxes,
spin boxes, and line edits use matching Breeze-style input frames whose inner
edge colors follow their Layan interiors in every state, avoiding a visible
color ring while retaining their original indicators.

Radio buttons and check boxes keep Breeze's 20 px layout slot but render the
Layan glyph at 16 px, centered with 2 px of transparent padding on each side,
instead of enlarging the visible glyph to fill the whole slot.

The SVG widget artwork is adapted from
[KvKonqi](https://github.com/Niru2169/KvKonqi) commit
`c7e66c755623c2b9f02288994c9292a18082134e`, under GPL-3.0. Its license is
included in `LICENSE.KvKonqi.md`. Layan's palette, indicators, and opacity values
are taken from the user's existing local Layan installation. Widget metrics are
based on [KDE Breeze](https://invent.kde.org/plasma/breeze) 6.7.4.

The narrow, rounded scrollbar frame is adapted from Kvantum's bundled
`KvSimplicity` theme by Tsu Jan, under GPL-3.0-or-later. It keeps Breeze's 21 px
scrollbar extent while leaving the groove transparent, so Qt Quick views do not
render the slider as a full-width gray slab. The included GNU GPL version 3 text
also covers this adapted artwork.

Kvantum exposes one layout-margin value, while Breeze distinguishes 10 px
top-level and 6 px child margins; this theme uses the top-level value. Kvantum
also fixes check/radio label spacing at 6 px rather than Breeze's 4 px. Native
window decorations and their title bars are outside Kvantum's scope and remain
controlled by KWin/Breeze; the theme's 24 px title metric applies to Qt MDI
subwindows.

The directory contains both variants:

- `LayanBreeze` — Layan light palette
- `LayanBreezeDark` — Layan dark palette

Select them through the unified theme manager with `theme preset kvantum`;
`theme preset breeze` restores the original native Breeze widget style.
