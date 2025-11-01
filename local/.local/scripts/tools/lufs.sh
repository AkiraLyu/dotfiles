#!/bin/bash
# 选择你的 PulseAudio 输入装置
AUDIO_SOURCE="alsa_output.pci-0000_00_1b.0.analog-stereo.monitor"  # 换成自己的设备名

# 捕获音讯并仅打印 “I:” 后面的响度（Integrated LUFS）
ffmpeg -hide_banner -nostats \
  -f pulse -i "$AUDIO_SOURCE" \
  -filter_complex "ebur128=peak=true" \
  -f null - 2>&1 | \
  awk -W interactive '/S:/{                    # 只抓含 I: 的行
      for(i = 1; i <= NF; i++)                 # 在这一行里找 I:
          if ($i == "S:") {                    # 找到后打印接下来的数值
              print $(i+1); fflush();
          }
  }'

