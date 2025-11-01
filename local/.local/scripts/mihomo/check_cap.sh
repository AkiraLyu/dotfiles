#!/usr/bin/env bash
# 检查并设置 mihomo 所需的 capabilities

BIN="/usr/bin/mihomo"
REQUIRED="cap_net_bind_service,cap_net_admin=ep"

# 检查文件是否存在
if [[ ! -x "$BIN" ]]; then
    echo "错误：找不到可执行文件 $BIN"
    exit 1
fi

# 获取当前 capabilities（去除路径部分）
current_caps=$(getcap "$BIN" 2>/dev/null | awk '{print $2, $3}' | tr -d ' ')

# 如果为空或不同于预期，则重新设置
if [[ -z "$current_caps" || "$current_caps" != "$REQUIRED" ]]; then
    echo "[*] 正在设置 $BIN capabilities..."
    sudo setcap cap_net_admin,cap_net_bind_service+ep "$BIN"

    # 再次检查结果
    new_caps=$(getcap "$BIN" 2>/dev/null | awk '{print $2, $3}' | tr -d ' ')
    if [[ "$new_caps" == "$REQUIRED" ]]; then
        echo "[+] 已成功授予 capabilities: $REQUIRED"
    else
        echo "[-] 设置 capabilities 失败，请检查 sudo 权限或文件系统支持"
        exit 1
    fi
else
    echo "[✔] $BIN 已具有所需 capabilities: $REQUIRED"
fi

