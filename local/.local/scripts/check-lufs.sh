#!/bin/bash

if [ $# -ne 1 ]; then
  echo "用法: $0 <音频文件>"
  exit 1
fi

INPUT_FILE="$1"

if [ ! -f "$INPUT_FILE" ]; then
  echo "错误：文件 '$INPUT_FILE' 不存在！"
  exit 2
fi

ffmpeg -hide_banner -nostats \
  -i "$INPUT_FILE" \
  -filter_complex "ebur128=peak=true" \
  -f null - 2>&1
