#!/usr/bin/env bash
set -euo pipefail

# 这里填你所有本地 Maildir 根目录
MAIL_ROOTS=(
  "$HOME/.mail/akira.uestc"
  # "$HOME/.mail/work"
)

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

snapshot_before="$TMPDIR/before.txt"
snapshot_after="$TMPDIR/after.txt"
new_files="$TMPDIR/new_files.txt"
notify_body="$TMPDIR/notify_body.txt"

: > "$snapshot_before"
: > "$snapshot_after"
: > "$new_files"
: > "$notify_body"

collect_new_files() {
  local root
  for root in "${MAIL_ROOTS[@]}"; do
    if [ -d "$root/INBOX/new" ]; then
      find "$root/INBOX/new" -maxdepth 1 -type f -printf '%p\n'
    fi
  done | sort
}

# 同步前快照
collect_new_files > "$snapshot_before"

# 执行同步
mbsync -a

# 同步后快照
collect_new_files > "$snapshot_after"

# 找出本次新增的邮件文件
comm -13 "$snapshot_before" "$snapshot_after" > "$new_files"

new_count=$(wc -l < "$new_files" | tr -d ' ')

if [ "$new_count" -eq 0 ]; then
  exit 0
fi

# 用 Python 解析 Subject，兼容 MIME 编码标题
python3 <<'PY' "$new_files" "$notify_body"
import sys
from email import policy
from email.parser import BytesParser
from email.header import decode_header

new_files_path = sys.argv[1]
notify_body_path = sys.argv[2]

def decode_mime_header(value):
    if not value:
        return "(无标题)"
    parts = decode_header(value)
    out = []
    for part, enc in parts:
        if isinstance(part, bytes):
            out.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(part)
    return "".join(out).strip() or "(无标题)"

lines = []
with open(new_files_path, "r", encoding="utf-8") as f:
    paths = [line.strip() for line in f if line.strip()]

for path in paths[:8]:   # 最多展示前 8 封，避免通知太长
    try:
        with open(path, "rb") as mf:
            msg = BytesParser(policy=policy.default).parse(mf)
        subject = decode_mime_header(msg.get("Subject"))
        from_ = decode_mime_header(msg.get("From"))
        lines.append(f"• {subject}\n  {from_}")
    except Exception:
        lines.append("• (邮件标题解析失败)")

extra = len(paths) - 8
if extra > 0:
    lines.append(f"… 另外还有 {extra} 封新邮件")

with open(notify_body_path, "w", encoding="utf-8") as out:
    out.write("\n".join(lines))
PY

action=$(notify-send \
  "📬 收到 ${new_count} 封新邮件" \
  "$(cat "$notify_body")" \
  --app-name="mail-check" \
  --icon="mail-message-new" \
  --action="open=打开 Thunderbird" \
  --wait)

if [ "$action" = "open" ]; then
  thunderbird &
fi
