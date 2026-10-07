#!/bin/bash
set -euo pipefail

export WINEPREFIX=${WINEPREFIX:-"$HOME/wine-pfx/default"}

setup_vkd3d_proton install
setup_dxvk install
