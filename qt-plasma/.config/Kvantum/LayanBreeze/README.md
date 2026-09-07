# Layan Breeze

`LayanBreeze` combines the light and dark palettes and translucency of the
locally installed Layan Kvantum theme with the widget geometry and interaction
model of KDE Breeze 6.7.4.

The geometry values are derived from KDE Breeze 6.7.4's `breezemetrics.h`: 6 px
layout spacing, 10 px dialog margins, 80×36 px minimum text command buttons,
20 px checks and slider handles, compact 8 px scroll bars, 6 px progress and
slider grooves, 30 px tabs, a 24 px internal MDI title bar, and 1 px visual
outlines. Toolbar frame width, item margin, spacing, and handle extent resolve
to Breeze's 0, 6, 0, and 10 px respectively.

The light window/menu and dark window/menu artwork retains Layan's 80% opacity;
tooltips also retain Layan's 80% opacity. Blur remains enabled. Popup menus use
a dedicated 6 px rounded frame with a 2 px soft outer shadow. Its 8 px total
inset adds only 2 px per edge compared with the previous shadowless frame.

Command buttons use a dedicated Breeze-style nine-slice frame with 5 px corner
radii, a single-pixel outline, and a subtle two-stage bottom shadow. The pressed
state removes the shadow and uses Layan's original neutral pressed fill; the
toggled state uses Layan's original `#4648fb` to `#716ffb` purple gradient.
Default dialog buttons use Breeze's softly tinted fill and rounded accent frame.
Their dedicated border-only focus frame replaces Kvantum's generic underline,
so compact buttons keep rounded corners without stacked borders while their
pressed fill remains visible.
Tool-button pressed overlays, toggled underlines, and item-view selections use
Layan's original opacity and colors; selected item text remains white in both
active and inactive views. Compensating content margins preserve the
80×36 px Breeze text-button metric despite the larger visual corner slices;
icon-only command buttons remain compact squares. Combo boxes,
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
are matched against the system-installed original Layan theme. Widget metrics
are based on [KDE Breeze](https://invent.kde.org/plasma/breeze) 6.7.4.

The narrow, rounded scrollbar frame is adapted from Kvantum's bundled
`KvSimplicity` theme by Tsu Jan, under GPL-3.0-or-later. It uses an 8 px
scrollbar extent, with a 4 px idle thumb that expands to the full extent on
hover, while leaving the groove transparent. The included GNU GPL version 3
text also covers this adapted artwork.

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
