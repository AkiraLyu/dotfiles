#!/usr/bin/env bash

declare -A handled=()

niri msg --json event-stream |
jq --unbuffered -r '
  .WindowOpenedOrChanged.window?
  | select(.pid != null)
  | [.id, .pid] | @tsv
' |
while IFS=$'\t' read -r id pid; do
    [[ ${handled[$id]+x} ]] && continue

    exe=$(readlink -f "/proc/$pid/exe") || continue
    [[ ${exe##*/} == xwayland-satellite ]] || continue

    handled[$id]=1
    (
        sleep 0.4
        niri msg action set-window-width --id "$id" "+1" >/dev/null 2>&1 || exit
        sleep 0.08
        niri msg action set-window-width --id "$id" "-1" >/dev/null 2>&1
    ) &
done
