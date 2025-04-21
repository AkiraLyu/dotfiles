#!/bin/bash

# 事件监听协程
coproc PLAYERCTL {
    playerctl metadata -p yesplaymusic,rhythmbox -f '{{lc(status)}}-{{title}}-{{artist}}' -F 2>/dev/null
}

# 混合模式参数
TIMEOUT=5     # 读取等待超时（秒）
LAST_STATE="" # 状态缓存

while true; do
    # 优先处理事件（非阻塞读取）
    if read -t 0 -r line <&${PLAYERCTL[0]}; then
        # 立即处理新事件
        LAST_STATE="${line:0:25}"
        echo "$LAST_STATE"
    else
        # 无事件时尝试带超时的阻塞读取
        if read -t $TIMEOUT -r line <&${PLAYERCTL[0]}; then
            LAST_STATE="${line:0:25}"
            echo "$LAST_STATE"
        else
            # 超时后主动获取当前状态（兼容无事件场景）
            current=$(playerctl metadata -p yesplaymusic,rhythmbox \
                -f '{{lc(status)}}-{{title}}-{{artist}}' 2>/dev/null)
            [ -n "$current" ] && current="${current:0:25}" || current="No Media Playing"

            # 仅状态变化时输出
            [ "$current" != "$LAST_STATE" ] && {
                LAST_STATE="$current"
                echo "$current"
            }
        fi
    fi
done
