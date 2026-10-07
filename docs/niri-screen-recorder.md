# Noctalia 录屏插件

[返回桌面与应用](desktop.md#niri)

本页说明 [Niri 配置存档](../de-wm/niri/)中保留的 Screen Recorder 1.2.3。插件作者为 `noctalia`，清单声明使用 MIT 许可证和插件 API 3。它通过 `gpu-screen-recorder` 录制屏幕，也支持回放缓冲区；插件随 Niri 配置保留，不由安装脚本部署。

## 依赖

录制需要 PATH 中的 `gpu-screen-recorder`，或 Flatpak 应用 `com.dec05eba.gpu_screen_recorder`。使用 Portal 捕获时，还需要 `xdg-desktop-portal` 和提供 ScreenCast 接口的后端。

输出目录由插件设置决定。目录设置为空时，使用 `~/Videos/Recordings`。

## 控制

插件 ID 为 `noctalia/screen_recorder`。无界面的 `service` 管理录制和回放进程，状态栏的 `recorder` 组件及控制中心的 `toggle` 快捷入口与它共享状态。

| 入口 | 操作 | 行为 |
| --- | --- | --- |
| 状态栏组件 | 左键 | 开始或停止录制 |
| 状态栏组件 | 右键 | 开始回放缓冲、停止等待中的回放缓冲，或保存正在运行的回放 |
| 状态栏组件 | 中键 | 保存正在运行的回放 |
| 控制中心 | 左键 | 切换录制状态 |
| 控制中心 | 右键 | 切换回放缓冲状态 |

回放操作仅在 `replay_enabled` 为 `true` 时可用。

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `video_source` | `portal` | 捕获方式：`focused` 或 `portal` |
| `directory` | `~/Videos/Recordings` | 输出目录 |
| `filename_pattern` | `recording_%Y%m%d_%H%M%S` | 不含扩展名的文件名时间格式 |
| `frame_rate` | `60` | 帧率，范围为 1–240 |
| `video_codec` | `h264` | 视频编码：`h264`、`hevc`、`av1`、`vp8` 或 `vp9` |
| `video_qp` | `25` | 固定质量参数，范围为 0–51；数值越小，质量越高，文件越大 |
| `resolution` | `original` | 原始尺寸，或 `1920x1080` 等指定尺寸 |
| `audio_source` | `default_output` | 输出、输入、两者或不录制音频 |
| `audio_codec` | `opus` | 音频编码：`opus`、`aac` 或 `flac` |
| `audio_bitrate` | `0` | 音频码率，单位 kbps；`0` 表示自动，不录制音频时隐藏 |
| `show_cursor` | `true` | 是否录制鼠标指针 |
| `color_range` | `limited` | 颜色范围：`limited` 或 `full` |
| `copy_to_clipboard` | `false` | 将保存文件的 URI 复制到剪贴板 |
| `hide_inactive` | `false` | 空闲时隐藏状态栏组件 |
| `glyph_unavailable` | `video-off` | 未安装录制程序时的图标 |
| `glyph_idle` | `video` | 空闲图标 |
| `glyph_pending` | `video` | 等待启动时的图标 |
| `glyph_recording` | `video` | 录制图标 |
| `glyph_replaying` | `repeat` | 回放图标 |
| `replay_enabled` | `false` | 启用回放缓冲控制 |
| `replay_duration` | `30` | 回放缓冲时长，单位秒 |
| `replay_storage` | `ram` | 将回放缓冲保存在内存或磁盘中 |
| `restore_portal` | `false` | 请求录制程序恢复 Portal 会话 |

## IPC

录制服务只有一个实例，且不绑定显示输出，因此 IPC 目标固定为 `all`：

```bash
noctalia msg plugin noctalia/screen_recorder:service all start
noctalia msg plugin noctalia/screen_recorder:service all stop
noctalia msg plugin noctalia/screen_recorder:service all toggle
noctalia msg plugin noctalia/screen_recorder:service all replay-start
noctalia msg plugin noctalia/screen_recorder:service all replay-stop
noctalia msg plugin noctalia/screen_recorder:service all replay-toggle
noctalia msg plugin noctalia/screen_recorder:service all replay-save
```

`start` 和 `replay-start` 可追加 `focused` 或 `portal`，覆盖此次捕获使用的 `video_source`；其他值会被忽略。`all` 是 IPC 目标，末尾参数才是捕获方式：

```bash
noctalia msg plugin noctalia/screen_recorder:service all start focused
noctalia msg plugin noctalia/screen_recorder:service all start portal
```

## 日志

服务通过 Noctalia 日志记录可用性、Portal 检查、录制命令和状态变化，前缀为 `screen_recorder:`。日志可在启动 Noctalia 的终端中查看；作为 systemd 服务运行时，也可通过 `journalctl` 查看。

录制程序的标准输出和错误写入 `$XDG_STATE_HOME/noctalia/screen_recorder/gpu-screen-recorder.log`。未设置 `XDG_STATE_HOME` 时，使用 `~/.local/state/`。该文件每次运行都会截断；录制启动失败或提前退出时，文件末尾会输出到 Noctalia 日志。
