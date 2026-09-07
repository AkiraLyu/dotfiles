#!/bin/sh
set -eu

# Share mount settings with the tray and desktop launcher.
exec python3 "$(dirname -- "$(readlink -f -- "$0")")/onedrive.py" --mount-only "$@"
