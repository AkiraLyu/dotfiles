#!/bin/bash
set -euo pipefail

# Compatibility entry point; keep partition and boot logic in the main flow.
script_dir=$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")
exec "$script_dir/../../../../../install.sh" --arch-mount "$@"
