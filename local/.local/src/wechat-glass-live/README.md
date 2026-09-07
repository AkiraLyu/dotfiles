# 微信局部透明

KWin 原生特效，当前版本 0.4.0。为 Flatpak 微信主窗口的顶栏和最左侧图标栏添加透明模糊，保留会话列表、聊天正文、头像和图标。仅匹配微信的 X11/XWayland 主窗口，弹窗、菜单和对话框保持原样。

## 构建和安装

构建需要 C++20 编译器、CMake、Ninja、Extra CMake Modules、KWin 开发文件、Qt6、KF6 KConfig 和 libxcb。运行需要 KDE Wayland、Better Blur DX、Python 3、`qdbus6`、`qmake6`、`kreadconfig6`、`kwriteconfig6` 和 `run0`。

当前验证环境：KWin 6.7.4、Qt 6.11.2、Better Blur DX 2.5.1、Flatpak 微信 4.1.13.9，显示缩放 125%。原生插件与 KWin ABI 绑定，升级 KWin 后如不能加载，应重新编译。

在 KDE 会话中执行：

```bash
cd ~/dotfiles/local/.local/src/wechat-glass-live
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build
python3 control.py install
```

安装脚本通过 `run0` 将构建产物复制到 `qmake6` 返回的 Qt 插件目录，移除本项目的旧版插件，然后启用特效及登录自动加载。请预先在 KDE 桌面特效中启用 Better Blur DX。自定义构建目录时使用 `python3 control.py install --build-dir <目录>`。

## 日常控制

```bash
python3 control.py status
python3 control.py disable
python3 control.py enable
python3 control.py opacity 0.52
python3 control.py uninstall
```

`opacity` 设置栏背景的不透明度，范围为 0.1–1.0，默认 0.52。启停和调节参数使用当前用户权限；安装、卸载系统插件时由 KDE 请求认证。

配置位于 `kwinrc` 的 `[Effect-wechat-glass-live]` 组，初始配置备份位于 `~/.local/state/wechat-glass-live/state.json`。启用时清理旧方案的 `wechat` 全局强制模糊项，保留其他程序的匹配配置；停用时恢复窗口原有的模糊属性。

| 配置项 | 默认值 | 含义 |
| --- | ---: | --- |
| BackgroundOpacity | 0.52 | 栏背景不透明度 |
| NavigationWidth | 60.8 | 最左侧图标栏宽度，逻辑像素 |
| TitleHeight | 32.8 | 顶栏高度，逻辑像素 |
| MatchTolerance | 0.025 | 识别背景色时的容差 |
| CornerRadius | 16 | KWin 未提供圆角尺寸时的回退半径 |

## 源码结构

- `glass.cpp`：窗口筛选、实时重绘、圆角和主窗口专属模糊区域。
- `glass.frag`：移除灰色背景底色，保留前景，并处理圆角及细描边。
- `metadata.json`、`shaders.qrc`：插件元数据和着色器资源。
- `CMakeLists.txt`、`control.py`：构建、安装和启停。
- `tests/`：合成窗口与隔离 KWin 回归检查。
- `docs/verification-0.4.0.json`：迁入前的验证记录。

构建文件、测试截图和运行日志均生成在 `build/`，由 Git 忽略。

## 回归检查

额外需要 `dbus-run-session`、`kwin_wayland`、XWayland、Spectacle、`xprop` 和 Python Pillow。测试在独立 D-Bus 会话中启动虚拟 KWin，使用合成窗口检查实时刷新、弹窗边框、圆角、模糊属性恢复，以及 100%／125% 缩放下移动窗口的细白边。

```bash
cmake -S . -B build -DWECHAT_GLASS_BUILD_TESTS=ON
cmake --build build
ctest --test-dir build --output-on-failure
```

结果、截图和日志位于 `build/test-results/`。

## 维护说明

窗口纹理通过 `OffscreenEffect` 随实际 surface damage 更新。`Effect.Shader` 的旧脚本方案使用静态 `CrossFadeEffect` 快照，会造成启动空白和点击后画面不刷新，不应替换回该接口。

模糊范围仅覆盖主窗口两条栏，并沿圆角内缩一个物理像素。窗口贴图同步按圆角裁切，最外侧灰色描边随栏背景变透明。不要重新添加 Better Blur DX 的 `wechat` 全局匹配，否则弹窗阴影和圆角外会出现矩形模糊块。

当前插件标识为 `wechat-glass-live-v4`，配置组保持稳定。Qt 会缓存已加载的插件库；如果需要在同一次 KWin 会话中加载修改后的二进制，应同步更新 CMake 目标、`control.py`、`shaders.qrc`、`glass.cpp` 和测试中的插件标识，并更新资源前缀。普通 ABI 重编译可以保留标识，在下次登录时加载。

许可证为 GPL-2.0-or-later，见 `LICENSE`。
