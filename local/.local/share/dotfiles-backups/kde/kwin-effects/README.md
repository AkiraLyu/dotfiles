# Manually installed KWin effects

This snapshot contains the settings for the two non-stock desktop effects:

- `better_blur_dx` — Better Blur DX, explicitly enabled. KDE's built-in
  `blur` effect is explicitly disabled because it is replaced by this effect.
- `shapecorners` — Rounded Corners (formerly ShapeCorners). Its plugin metadata
  enables it by default, so the live `kwinrc` did not contain an enable key;
  `shapecornersEnabled=true` is recorded explicitly in the snapshot so a
  restore does not depend on that package default.

`kwinrc.fragment` is intentionally limited to these effects. Do not copy it
over `~/.config/kwinrc`, because that file also contains desktops, tiling and
window-decoration state. Restore by merging the listed groups and keys, then
ask KWin to reconfigure or log in again.

The package names are also present in `backup/pacman/pkglist_aur.txt`; the
versioned `packages.txt` records the exact installed versions at export time.
