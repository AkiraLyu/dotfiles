# Qt / Plasma

本目录保存 Qt 外观、Plasma QML、桌面设置快照和原生插件包模板。原生源码统一在 `local/.local/src/`。

```bash
./install.sh --restore kde-plugins   # --restore pacman 已包含
./install.sh --restore kde --check
./install.sh --restore kde           # 首次登录 Plasma 前
./install.sh qt-plasma local
```

## 文件归属

| 目录 | 内容 |
| --- | --- |
| `.config/` | Darkly、Qt6ct、Kvantum 配置，Stow 部署 |
| `.local/share/plasma/plasmoids/` | 用户 QML 组件及 App Grid 源码链接 |
| `state/` | KDE 设置、theme 的 mode/preset 与 Darkly 派生主题，复制为独立运行文件 |
| `templates/org.kde.kate.desktop` | 静态 Kate 入口，复制后允许 Kate 写入会话 Actions |
| `packaging/PKGBUILD.in` | App Grid、Kate、微信三个原生插件的包模板 |

`state/`、`templates/`、`packaging/` 和说明文件不参与 Stow。恢复会校验快照、转换源 HOME 路径并检查全部目标；相同数据跳过，不覆盖不同运行配置。Kate 已有的独立入口保留会话信息。

修改桌面后使用 `./install.sh --export kde` 导出桌面设置、`~/.local/state/theme/{mode,preset}` 和派生主题，并从当前 Kate 入口提取静态模板，排除应用生成的会话 Actions。手工编辑快照还需同步 manifest 摘要，因此优先修改运行配置后导出。需要重新生成 Darkly 派生主题时使用 `install-darkly-plasma-transparency`，验证后再导出。

## 原生插件维护

`dotfiles-kde-plugins` 管理 App Grid 的 core/effects QML 模块、系统 KPackage、Kate 的 KTextEditor 插件及微信 KWin 插件。恢复器检查源码、Qt/KWin/KTextEditor 版本及包文件；需要构建时运行 App Grid 测试，再通过 pacman 安装。

成品和构建输入只保留 `backup/packages/dotfiles-kde-plugins/` 中的一份。安装使用正常的 pacman 文件冲突检查。

Qt/KF/KWin 更新后运行 `--restore kde-plugins` 并重新登录验收；安装器不重启桌面。Better Blur DX / Rounded Corners 由软件包和 kwinrc 管理，Rounded Corners 当前依赖包默认启用状态。

钱包由 private 阶段恢复；显示器数据库、Kate 会话与文档另外迁移。
