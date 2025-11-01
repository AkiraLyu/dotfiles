#!/bin/bash

wineprefix="$HOME/.wine/"

WINEPREFIX=$wineprefix setup_vkd3d_proton install
WINEPREFIX=$wineprefix setup_dxvk install
