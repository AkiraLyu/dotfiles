# niri-first-window

一个用 Rust 编写的 niri IPC 常驻插件：

- 在任意空 workspace 中打开第一个窗口时，只把这个窗口切换为浮动，设置为启动参数给出的逻辑像素尺寸，并将完整窗口居中。
- 若匹配的 `window-rule` 规定首窗以 maximized 打开，或首窗打开时已经处于真实 maximized 状态，插件不会对该窗口执行任何 action。
- 若首窗之后才进入 maximized 状态，普通后续窗口打开时也不会取消其 maximized 状态。
- 只有匹配的 `window-rule` 同时规定 `open-floating true` 和 `default-column-width`/`default-window-height` 时，插件才保留首窗由 niri 得出的原始尺寸，只将其浮动并居中。非浮动规则中的尺寸不会取代命令行尺寸。
- 若第一个窗口原本由 `window-rule` 以浮动方式打开，则后续窗口出现时，第一个窗口继续保持调整后的浮动尺寸。
- 若第一个窗口没有由 `window-rule` 规定 `open-floating true`，则第一个非 popup 的后续窗口出现时，将第一个窗口恢复为平铺及调整前的尺寸。
- 第二个及后续窗口不会被插件修改，因此自动遵循各自原有的 `window-rule`。
- 第一个窗口创建的原生 popup 不属于 IPC 顶层窗口；若应用把 popup 实现为子顶层窗口，插件会识别并忽略它，不触发首窗恢复。
- 每个 workspace 独立跟踪，窗口关闭或移动到其他 workspace 时会更新状态。
- 插件启动前已经存在的窗口不会被修改，重启插件是安全的。

niri 没有进程内插件接口，因此本项目通过官方 IPC `event-stream` 监听窗口变化，并通过带窗口 ID 的 action 操作目标窗口。

## 兼容性

当前版本针对 niri `26.04`，并固定使用 `niri-ipc = 26.4.0`。尺寸使用 niri 的逻辑像素；若窗口自身的最小/最大尺寸或屏幕工作区更小，niri 可能会限制最终尺寸。

`niri-ipc 26.4.0` 不会返回具体命中的 `window-rule` 或 maximized 状态，因此插件会读取 niri KDL 配置及递归 `include`，按照 app-id、title、match/exclude 和规则覆盖顺序解析 `open-floating`、`open-maximized`、`open-maximized-to-edges` 与尺寸设置。配置成功重载时，插件也会同步重载规则。默认配置路径与 niri 一致，可用 `--config PATH` 显式指定。

真实的当前 maximized 状态通过 niri 提供的两种 Wayland foreign-toplevel 协议读取：`ext-foreign-toplevel-list-v1` 提供可对应 IPC 窗口 ID 的 identifier，`wlr-foreign-toplevel-management-v1` 提供 maximized state。程序在处理新窗口 IPC 事件前同步两者，因此应用主动请求 maximized、窗口打开后再 maximized，以及 `open-maximized-to-edges` 都会被识别。`open-maximized` 是 niri 的满宽列规则，不等同于 xdg-toplevel maximized，仍由配置解析识别。

首窗是否由规则规定浮动，以匹配规则最终解析出的 `open-floating true` 为准。对于实现为子顶层窗口的 popup，IPC 不提供父窗口 ID，因此使用“浮动、PID 相同且 app-id 相同”进行识别；原生 xdg popup 无须推断，因为它不会进入顶层窗口事件流。

## 构建与安装

```bash
cargo test
cargo install --path .
```

把下面一行加入 niri 配置（例如 `~/.config/niri/configs/exec/plugins.kdl`）：

```kdl
spawn-at-startup "niri-first-window" "1280" "720"
```

然后重新登录 niri。也可以先在 niri 会话中的终端里手动测试：

```bash
niri-first-window 1280 720 --verbose
```

前两个必填参数依次为宽度和高度。例如调整为 `1440 × 900`：

```bash
niri-first-window 1440 900
```

使用非默认 niri 配置文件时：

```bash
niri-first-window 1280 720 --config /path/to/config.kdl
```

不要同时运行多个实例，否则它们会重复处理同一个窗口事件。

## 工作方式

插件分别建立事件和 action 两条 IPC 连接，并按 workspace 跟踪由插件处理的首窗：

1. 空 workspace 的首窗：先解析匹配的初始 `window-rule`。
2. 由规则规定 maximized 或已处于真实 maximized 状态的首窗：完全忽略，不改变布局、尺寸或位置。
3. 同时匹配 `open-floating true` 与显式尺寸规则的首窗：记录初始状态与尺寸，只切换为浮动并居中；其他首窗均使用命令行传入的尺寸，提交新尺寸后再次校正中心位置。
4. 首窗创建的 popup：不执行 action，也不把它算作触发首窗恢复的后续窗口。
5. 第一个普通后续窗口：若首窗当前 maximized，或原本由规则规定浮动，则保持不变；否则将首窗切回平铺并恢复原始尺寸。
6. 后续窗口本身始终不执行 action，继续使用 niri 已经应用的 `window-rule`。

## 参考

- [niri IPC 与 `niri msg`](https://github.com/niri-wm/niri/wiki/IPC)
- [niri 浮动窗口](https://github.com/niri-wm/niri/wiki/Floating-Windows)
