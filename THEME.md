# Unified color theme

`theme` is the only writer for the light/dark preference. Its canonical state is:

```text
~/.local/state/theme/mode
```

The file contains exactly `light` or `dark`. Desktop settings and environment variables are derived outputs, never inputs after the first migration.

## Commands

```bash
theme light
theme dark
theme toggle
theme status
theme apply       # idempotently repair drift
theme --dry-run dark
```

Niri also binds `Mod+Shift+T` to `theme toggle`. “Toggle Color Theme” is available in desktop application launchers, with explicit Light and Dark actions.

## Managed backends

| Consumer | Light | Dark |
| --- | --- | --- |
| KDE global theme | `custom_light` | `custom_dark` |
| KDE color scheme | `LayanLight` | `BreezeDark` |
| GTK preference | `prefer-light` | `prefer-dark` |
| GTK theme/icons | `Breeze` / `Papirus` | `Breeze` / `Papirus` |
| Niri Qt platform theme | `qt6ct` | `qt6ct` |
| KDE Qt platform theme | `kde` | `kde` |
| Noctalia mode | `light` | `dark` |
| Kitty | `kitty.conf.light` | `kitty.conf.dark` |
| Neovim | `vscode` | `tokyonight` |
| Rofi | `rounded-white` | `rounded-purple-dark` |

If a custom KDE global theme is unavailable, the command falls back to the corresponding Breeze global theme. If `LayanLight` is unavailable, it falls back to `BreezeLight`.

## Session behavior

`theme-sync.service` runs once for every graphical session through `personal-graphical.target`. It reapplies saved state after KDE's GTK synchronizer or Noctalia starts, and updates the systemd/D-Bus activation environment for newly launched applications.

Fish, Kitty and Neovim only read the state file. They do not write GSettings, KDE settings or `qt6ct.conf`, so opening a shell can no longer change the desktop theme. Existing Kitty instances reload after a switch; new Neovim instances read the state directly, including `Terminal=true` desktop launches that bypass Fish.

Use `theme light`, `theme dark` or the desktop entry instead of changing the KDE/Noctalia theme independently. `theme apply` intentionally repairs such drift back to the saved state.
