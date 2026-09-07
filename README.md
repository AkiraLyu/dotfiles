# Arch Linux dotfiles

保存 KDE Plasma、Niri 与应用配置，以 `install.sh` 管理软件恢复、私有备份和 GNU Stow 部署。完整顺序、各阶段输入和限制见 [RESTORE.md](RESTORE.md)。从安装介质开始时，使用 [Arch ISO 安装阶段](docs/ARCH_INSTALL.md)，三个磁盘阶段默认只读。

迁出前更新清单和私有快照：

```bash
./install.sh --export all
```

`backup/` 不进入 Git，重装时完整手动迁移。其中包括四类 pacman 清单、Codex 快照，以及 `backup/private/` 中的 rclone、Mirador 配置与 KWallet 钱包；Rust、Cargo、npm、Flatpak 清单保存在 `packages/`。npm 保持家目录 prefix 和现有安装版本。

新机器先准备适用的软件源，再按顺序运行：

```bash
./install.sh --plan
./install.sh --bootstrap
./install.sh --restore pacman rust cargo npm flatpak --check
./install.sh --restore pacman rust cargo npm flatpak
./install.sh --restore codex              # 首次启动 Codex 前，目标 .codex 必须为空或不存在
./install.sh --restore private            # 首次启动挂载、Mirador 和钱包前恢复；不同数据不覆盖
./install.sh --check
./install.sh fish kitty qt-plasma niri    # 按准备进度选择配置包
```

无参数选择 fontconfig、fish、kitty、chromium、tools、qt-plasma、local、nvim、niri。`etc`、`firefox`、`systemd` 需显式选择；服务放到依赖和私有配置恢复之后。所有所选目标通过 Stow 预检后才写入，现有冲突不会被自动覆盖。

```bash
./install.sh --check --all
./install.sh firefox --firefox-profile /path/to/profile
./install.sh --user-targets --check
./install.sh --user-targets
```

`--all` 是全部配置包，`--restore all` 是全部软件/私有数据阶段。后者会检查 Codex 目标，因此当前正在使用 Codex 时应只选择需要的软件阶段。完整选项见 `--help`。

Neovim 只保留配置；VS Code 使用 GitHub 同步；Firefox 扩展由自动同步恢复。Noctalia 已保存 v5 配置和录屏插件，v4 已清除。Qt/Plasma 配置和安装入口位于 [qt-plasma/](qt-plasma/README.md)，原生程序源码统一位于 [local/.local/src/](local/.local/src/README.md)。明暗主题与预设由 [theme](THEME.md) 管理。

基础安装、UUID/EFI、触控板修复与用户 target 已接入；部分自编译程序制包、其他账户数据和实际重装验收仍待整理。软件计划或 Stow 检查通过不能替代全新机器验证。

EasyEffects 预设按 v8 的数据目录保存，桌面自定义入口和图标由 Stow 部署；挂载、Wine 前缀和已退役配置的处理见 [应用维护说明](docs/APPLICATIONS.md)。

安装/恢复测试（普通用户，需要 Python 和 GNU Stow）：

```bash
python3 -B -m unittest discover -s tests -v
```
