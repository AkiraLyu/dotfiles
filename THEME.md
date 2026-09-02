# Unified color theme

`theme` is the only writer for the color mode and widget preset. Their canonical state is:

```text
~/.local/state/theme/mode
~/.local/state/theme/preset
```

`mode` contains `light` or `dark`; `preset` contains `breeze` or `kvantum`. Desktop settings and environment variables are derived outputs, never inputs after the first migration. Color mode and widget preset are independent, so either preset can be used in light or dark mode.

## Commands

```bash
theme light
theme dark
theme toggle
theme preset breeze
theme preset kvantum
theme preset      # print the active preset
theme presets     # list available presets
theme status
theme apply       # idempotently repair drift
theme --dry-run preset breeze
```

Niri also binds `Mod+Shift+T` to `theme toggle`. “Toggle Color Theme” is available in desktop application launchers, with explicit Light, Dark, Breeze and Kvantum actions.

## Widget presets

| Preset | Qt widget style | Light colors | Dark colors | Kvantum theme |
| --- | --- | --- | --- | --- |
| `breeze` | KDE Breeze | `LayanLight` | `BreezeDark` | Not used |
| `kvantum` | Kvantum | `LayanLight` | `Layan` | `LayanBreeze` / `LayanBreezeDark` |

The `breeze` preset preserves the original setup. The `kvantum` preset keeps Layan's palette and translucency while using Breeze-compatible widget geometry and styling. Its theme files live at `~/.config/Kvantum/LayanBreeze`.

## Managed backends

| Consumer | Light | Dark |
| --- | --- | --- |
| KDE global theme | `custom_light` | `custom_dark` |
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
