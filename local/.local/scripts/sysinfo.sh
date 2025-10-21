#!/usr/bin/env bash
# collect_sysinfo.sh
# 说明：收集系统相关信息并生成 markdown 文档，输出放在代码块中。
# 使用：chmod +x collect_sysinfo.sh && sudo ./collect_sysinfo.sh
# （建议用 sudo 运行以获取 dmesg / lspci -k 等更完整的信息）

set -u

# 输出文件（带时间戳）
OUT="system-info-$(date +%F-%H-%M-%S).md"

# Helper: append a section with command and its output in a fenced code block
append_section() {
  local title="$1"
  local cmd="$2"

  echo "## $title" >> "$OUT"
  echo "" >> "$OUT"
  echo '```' >> "$OUT"
  # Run the command; capture both stdout and stderr
  # We want the raw output appended (no command echo), so we run via sh -c
  sh -c "$cmd" >> "$OUT" 2>&1 || true
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
}

# Write header
cat > "$OUT" <<EOF
# System Information Report
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ") (UTC)

This report collects kernel, hardware, network and firmware information. Each section contains the raw command output inside a fenced code block.
EOF

echo "" >> "$OUT"

# Recommended order:
# 1. Basic host / kernel info
append_section "Hostname and Current User" "hostname && echo && whoami && id"

append_section "Kernel and OS" "uname -a && echo && (if command -v lsb_release >/dev/null 2>&1; then lsb_release -a; else echo 'lsb_release not available'; fi)"

# 2. Boot / kernel messages (dmesg)
append_section "dmesg (kernel ring buffer)" "sudo dmesg --ctime | tail -n +1"

# 3. PCI and drivers
append_section "PCI devices (lspci -k for drivers)" "if command -v lspci >/dev/null 2>&1; then lspci -vvnnk; else echo 'lspci not installed'; fi"

# 4. Loaded kernel modules
append_section "Loaded kernel modules (lsmod)" "lsmod"

# 5. Firmware files related to rtw89/8852
append_section "Firmware files under /lib/firmware/rtw89 (grep 8852)" "if [ -d /lib/firmware/rtw89 ]; then find /lib/firmware/rtw89/ -type f | grep 8852 || echo 'no matching files'; else echo '/lib/firmware/rtw89 not present'; fi"

# 6. Kernel version (explicit)
append_section "Kernel release (uname -r)" "uname -r"

# 7. Network interfaces and addresses
append_section "Network interfaces (ip a)" "ip a || ifconfig -a"

# 8. Brief network status (compact)
append_section "Network interfaces (brief)" "ip -br link && echo && ip -br addr"

# 9. Wireless / rfkill
append_section "rfkill list all" "if command -v rfkill >/dev/null 2>&1; then rfkill list all; else echo 'rfkill not installed'; fi"

# 10. Additional useful info: block devices and mount points
append_section "Block devices and mounts (lsblk & mount)" "lsblk -a && echo && mount | column -t || (echo 'mount output unavailable')"

# 11. Recent kernel messages (journal) if systemd is present
append_section "Recent kernel messages (journalctl -k -b)" "if command -v journalctl >/dev/null 2>&1; then journalctl -k -b; else echo 'journalctl not available'; fi"

# 12. Optional: PCI device grep for Realtek 8852/rtw89 (quick filter)
append_section "Filter lspci for Realtek / Wireless keywords" "if command -v lspci >/dev/null 2>&1; then lspci | grep -E -i 'realtek|wireless|network|rtl' || true; else echo 'lspci not installed'; fi"

# Footer
cat >> "$OUT" <<EOF

---

*Note*: some commands require root privileges to show full details (e.g. dmesg, lspci -k). If you ran this without sudo and see permission errors, please rerun with sudo.

EOF

echo "Report written to: $OUT"

