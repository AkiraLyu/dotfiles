#!/bin/bash

set -euo pipefail

# Keep this existing entry point, but use the installer's resolver and preflight.
script_dir=$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")
repo_dir=${DOTFILES_DIR:-${script_dir%/local/.local/scripts/apps/desktop}}

if (($# == 1)) && [[ $1 == --help || $1 == -h || $1 == --plan ]]; then
    exec "$repo_dir/install.sh" "$1"
fi
exec "$repo_dir/install.sh" "$@" firefox
