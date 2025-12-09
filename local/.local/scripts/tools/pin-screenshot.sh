#!/bin/bash

outfile=/tmp/screen.png

# 删除旧的截图文件
rm -f "$outfile"

# 触发截图
niri msg action screenshot --path "$outfile"

# 等待直到新的文件被写出来
while [ ! -s "$outfile" ]; do
    sleep 0.05
done

# 再等一点点，防止文件还在写
sleep 0.05

display "$outfile"

