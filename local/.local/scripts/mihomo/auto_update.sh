#!/usr/bin/env bash
# ============================================
# Clash 配置自动更新与自动修补脚本
# - 从远程下载配置
# - 检查/插入 tun 段
# - 确保 dns 段中 enable=true 且 enhanced-mode=fake-ip
# 作者: Akira
# ============================================

URL=$CLASH_SUBSCRIPTION
CONFIG_PATH="/home/akira/.config/clash/config.yaml"
TMP_FILE=$(mktemp)

die() { echo "❌ $*" >&2; exit 1; }

[[ -z "$URL" ]] && die "用法: $0 <配置文件URL>"

echo "📥 正在下载配置文件..."
mkdir -p "$(dirname "$CONFIG_PATH")" || die "创建配置目录失败"
curl -fsSL "$URL" -o "$CONFIG_PATH" || die "下载失败：$URL"
echo "✅ 下载完成: $CONFIG_PATH"

# === 修正 DNS 段 ===
echo "🔧 正在修正 dns 段..."

awk '
/^dns:/ {
    print $0
    in_dns=1
    next
}
in_dns && /^[^[:space:]]/ {  # 遇到新的顶级键时退出 dns 段
    if (!has_enable) print "  enable: true"
    if (!has_enhanced) print "  enhanced-mode: fake-ip"
    in_dns=0
}
in_dns && /^\s*enable:/ { print "  enable: true"; has_enable=1; next }
in_dns && /^\s*enhanced-mode:/ { print "  enhanced-mode: fake-ip"; has_enhanced=1; next }

{ print }
END {
    # 如果文件末尾还在 dns 段
    if (in_dns) {
        if (!has_enable) print "  enable: true"
        if (!has_enhanced) print "  enhanced-mode: fake-ip"
    }
}
' "$CONFIG_PATH" > "$TMP_FILE" && mv "$TMP_FILE" "$CONFIG_PATH"

echo "✅ 已确保 dns.enable=true 且 dns.enhanced-mode=fake-ip"

# === 检查是否已有 tun 段 ===
if grep -qE '^\s*tun\s*:' "$CONFIG_PATH"; then
    echo "⚠️ 检测到已存在 tun 段，跳过插入。"
    exit 0
fi

# === 插入 tun 段 ===
echo "🔧 正在插入 tun 段..."

awk '
/^proxies:/ && !inserted {
    print "tun:"
    print "  enable: true"
    print "  stack: system"
    print "  auto-route: true"
    print "  auto-redirect: true"
    print "  auto-detect-interface: true"
    print "  device: Meta"
    inserted=1
}
{ print }
' "$CONFIG_PATH" > "$TMP_FILE" && mv "$TMP_FILE" "$CONFIG_PATH"

echo "✅ 已在 dns 和 proxies 之间插入 tun 段。"

