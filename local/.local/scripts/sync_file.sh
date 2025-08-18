#!/bin/bash
SRC="$HOME/Docs/Library/"
DEST="/mnt/data/Zlibrary/"

rsync -avh --delete --progress --info=progress2 "$SRC" "$DEST"

