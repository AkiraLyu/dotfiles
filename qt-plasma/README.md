# Qt / Plasma 定制

独立 Stow 包，保存 Qt 外观配置、Plasma QML 组件和安装入口。原生插件源码统一保存于 [local/.local/src/](../local/.local/src/README.md)。`./install.sh qt-plasma` 部署配置与入口；源码随 `local` 包部署，工具命令名不变。

| 位置 | 用途与安装方式 |
| --- | --- |
| `.config/darklyrc`、`.config/qt6ct/` | Darkly/Qt6ct 设置，Stow 部署；派生颜色由主仓库 theme 生成 |
| `.config/Kvantum/LayanBreeze/` | Kvantum 混合主题，保留原许可说明 |
| `.local/bin/*kate*` | Kate wrapper 与安装器；从 `local/.local/src/kate-translucent-bars/` 读取源码 |
| `.local/bin/*darkly-plasma-transparency` | 从已安装 Darkly 生成派生 Plasma 主题，源布局变化后需重新验证 |
| `../local/.local/src/appgrid/` | App Grid 原生模块、QML、测试和文档，含迁入时未提交修改 |
| `../local/.local/src/wechat-glass-live/` | 微信局部透明 KWin 特效源码 |
| `.local/share/plasma/plasmoids/` | App Grid、Android App Folder 1.3.0、Plasma Drawer 2.0.2；App Grid 链接至源码 package，避免双份代码 |
| `.local/share/dotfiles-backups/kde/kwin-effects/` | Better Blur DX / Rounded Corners 包名与 kwinrc 合并片段 |
| `../local/.local/src/sources.json` | 统一来源和 SHA256 索引；原外部工作区已归档于 backup，旧 Projects 路径指向集中后的源码 |
| `archive/legacy-working-tree.patch` | 原 qt6ct/Untitled 中的历史 diff，仅归档，不作为配置部署 |

顶层 README 和 archive 由 `.stow-local-ignore` 排除。源码快照不带独立 `.git` 或运行状态，原工作区保存在 backup。Plasma Drawer 上游为 [p-connor/plasma-drawer](https://github.com/p-connor/plasma-drawer)，保留各组件 metadata/许可。

## 新机器构建

完成主入口的包恢复后，补齐构建依赖：

```bash
run0 pacman -S --needed base-devel cmake ninja extra-cmake-modules \
  qt6-base qt6-declarative qt6-wayland kcoreaddons ktexteditor \
  kwidgetsaddons kconfig kwindowsystem kwin libxcb wayland
```

ECM 是本次检查发现的额外依赖，当前旧机器未安装，因此不在“实际已安装”的 pacman 快照中。构建要求在此显式记录。

部署后使用现有入口：

```bash
install-kate-translucent-bars
install-darkly-plasma-transparency
```

App Grid 和微信特效的构建、安装/卸载分别见 [App Grid README](../local/.local/src/appgrid/README.md) 与 [微信插件 README](../local/.local/src/wechat-glass-live/README.md)。App Grid 的完整安装包含 `/usr` 下的原生 QML 模块，仅 Stow QML 无法代替；微信还需要 Better Blur DX 和 KDE 会话。

原生安装器目前仍写入不属于 pacman 包的 `.so`。本次按用户要求仅集中源码和修正关联路径。Stow 不执行编译、系统库安装或 Plasma/KWin 重载。

## 迁移验证

当前三个用户 Plasma QML 目录与仓库副本逐文件一致后，已改为相对链接。原折叠的 `~/.local/src` 已改为普通目录和各源码链接，相关工具/Qt 配置链接也已同步。`./install.sh --check qt-plasma` 通过。

此前 Kate、App Grid、微信特效均在临时目录编译通过，App Grid 的普通/150%/200% QML 测试和 qmllint 共四项通过。该次验证的 ECM 仅解包到临时目录，未安装系统包或编译产物。本次源码集中仅检查内容、路径和 Stow 部署计划，没有重新构建或重载桌面。

Kate 使用内部控件结构，App Grid 使用 Plasma private.kicker，微信插件绑定 KWin ABI。Qt/KF/KWin 更新后仍需重新编译并验证加载和外观。
