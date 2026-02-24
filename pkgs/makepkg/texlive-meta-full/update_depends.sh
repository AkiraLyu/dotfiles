#!/usr/bin/env bash
set -e

PKGBUILD_FILE="PKGBUILD"
TMP_FILE="$(mktemp)"

echo "Generating texlive dependency list..."

# 读取 texlive group
mapfile -t NEW_PKGS < <(pacman -Sgq texlive | sort -u)

# 生成 depends 块
{
    echo "depends=("
    for pkg in "${NEW_PKGS[@]}"; do
        echo "    $pkg"
    done
    echo ")"
} > "$TMP_FILE.depends"

# 读取旧 depends
OLD_BLOCK=$(sed -n '/^depends=(/,/)/p' "$PKGBUILD_FILE")
NEW_BLOCK=$(cat "$TMP_FILE.depends")

# 如果无变化
if [[ "$OLD_BLOCK" == "$NEW_BLOCK" ]]; then
    echo "No change detected."
    rm -f "$TMP_FILE.depends"
    exit 0
fi

echo "Updating depends..."

# 替换 depends 区块
awk -v newfile="$TMP_FILE.depends" '
BEGIN {skip=0}
/^depends=\(/ {
    while ((getline line < newfile) > 0) print line
    close(newfile)
    skip=1
    next
}
skip && /^\)/ {
    skip=0
    next
}
!skip {print}
' "$PKGBUILD_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$PKGBUILD_FILE"
rm -f "$TMP_FILE.depends"

# bump pkgrel
echo "Bumping pkgrel..."

OLD_REL=$(grep '^pkgrel=' "$PKGBUILD_FILE" | cut -d= -f2)
NEW_REL=$((OLD_REL + 1))

sed -i "s/^pkgrel=.*/pkgrel=${NEW_REL}/" "$PKGBUILD_FILE"

echo "Done! pkgrel -> $NEW_REL"

