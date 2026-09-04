# Unified color theme

`theme` is the only writer for the color mode and widget preset. Their canonical state is:

```text
~/.local/state/theme/mode
~/.local/state/theme/preset
```

`mode` contains `light` or `dark`; `preset` contains `breeze`, `darkly` or `kvantum`. Desktop settings and environment variables are derived outputs, never inputs after the first migration. Color mode and widget preset are independent, so any preset can be used in light or dark mode.

## Commands

```bash
theme light
theme dark
theme toggle
theme preset breeze
theme preset darkly
theme preset kvantum
theme preset      # print the active preset
theme presets     # list available presets
theme status
theme apply       # idempotently repair drift
theme --dry-run preset breeze
```

Niri also binds `Mod+Shift+T` to `theme toggle`. “Toggle Color Theme” is available in desktop application launchers, with explicit Light, Dark, Breeze, Darkly and Kvantum actions.

## Appearance presets

| Preset | Qt style | Plasma theme | KWin decoration | Light colors | Dark colors | Kvantum theme |
| --- | --- | --- | --- | --- | --- | --- |
| `breeze` | KDE Breeze | Breeze | Breeze | `LayanLight` | `BreezeDark` | Not used |
| `darkly` | Darkly | Darkly Translucent (fallback: Darkly) | Darkly | `LayanLight` | `BreezeDark` | Not used |
| `kvantum` | Kvantum | Breeze | Breeze | `LayanLight` | `Layan` | `LayanBreeze` / `LayanBreezeDark` |

The `breeze` preset preserves the original setup. The `darkly` preset captures the current light configuration with the Darkly application style, Plasma theme, window decoration, saved opacity settings, and LayanLight colors. Its dark mode retains that appearance and changes only the Qt/KDE color scheme to BreezeDark. The saved Darkly settings live at `~/.config/darklyrc`, and the required `darkly-bin` package is recorded in the AUR package list. The `kvantum` preset keeps Layan's palette and translucency while using Breeze-compatible widget geometry and styling. Its theme files live at `~/.config/Kvantum/LayanBreeze`.

Darkly's packaged Plasma assets are opaque even when its Qt menu opacity is lower. Install the user-local `darkly-translucent` derivative to give Plasma notifications and native popups 60% backgrounds without writing to `/usr/share` or changing KWin settings:

```bash
install-darkly-plasma-transparency
theme apply
```

The installer copies the installed Darkly Plasma theme into `~/.local/share/plasma/desktoptheme/darkly-translucent`, changes only `dialogs/background.svg`, `widgets/background.svg`, and the copied package identity, and validates the expected SVG layout before replacing an older generated copy. The Darkly preset selects this theme when present and safely falls back to the packaged `darkly` theme when absent.

Kate's left tool selector and bottom/status bar can use the same opacity as
Darkly's toolbar without changing the editor, line-number gutter, document tabs,
or any other application. Install the user-local Kate plugin and restart Kate:

```bash
install-kate-translucent-bars
```

The plugin is active only while the Qt application style is Darkly. It reads
`Style/KateBarsOpacity` from `~/.config/darklyrc`, falling back to the existing
`Style/ToolBarOpacity`. The plugin leaves blur-region ownership with Darkly and
only supplies a near-opaque top-level palette hint, causing Darkly to request
one stable full-window blur region while the plugin paints only the two selected
bars translucently. This avoids competing `KWindowEffects` updates when Kate
repaints the cursor or changes documents. It is discovered through a Kate-only
wrapper rather than a global Qt environment override. The wrapper
also enables it in Kate's per-session configuration, including the anonymous
session. Remove it completely with:

```bash
remove-kate-translucent-bars
```

To remove the generated theme completely, restore the packaged Darkly Plasma theme, and delete its cache:

```bash
remove-darkly-plasma-transparency --dry-run
remove-darkly-plasma-transparency
```

## Managed backends

| Consumer | Light | Dark |
| --- | --- | --- |
| KDE global theme | `custom_light` | `custom_dark` (`darkly` retains `custom_light`) |
| KDE color scheme | Preset-defined | Preset-defined |
| Qt widget style | Preset-defined | Preset-defined |
| GTK preference | `prefer-light` | `prefer-dark` |
| GTK theme/icons | `Breeze` / `Papirus` | `Breeze` / `Papirus` |
| Niri Qt platform theme | `qt6ct` | `qt6ct` |
| KDE Qt platform theme | `kde` | `kde` |
| Noctalia mode | `light` | `dark` |
| Kitty | `kitty.conf.light` | `kitty.conf.dark` |
| Neovim | `vscode` | `tokyonight` |
| Rofi | `rounded-white` | `rounded-purple-dark` |

If a custom KDE global theme is unavailable, the command falls back to the corresponding Breeze global theme. If a Layan color scheme is unavailable, it falls back to the matching Breeze scheme.

## Session behavior

`theme-sync.service` runs once for every graphical session through `personal-graphical.target`. It reapplies saved state after KDE's GTK synchronizer or Noctalia starts, and updates the systemd/D-Bus activation environment for newly launched applications.

Fish, Kitty and Neovim only read the state file. They do not write GSettings, KDE settings or `qt6ct.conf`, so opening a shell can no longer change the desktop theme. Existing Kitty instances reload after a switch; new Neovim instances read the state directly, including `Terminal=true` desktop launches that bypass Fish.

Use `theme light`, `theme dark`, `theme preset …` or the desktop entry instead of changing the KDE/Noctalia theme independently. `theme apply` intentionally repairs such drift back to the saved mode and preset.
