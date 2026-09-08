# Arch Linux dotfiles

通过 `install.sh` 恢复软件、私有数据和 KDE Plasma / Niri 配置。完整操作顺序见 [RESTORE.md](RESTORE.md)，当前复现缺口见 [review.md](review.md)。

迁出前退出会改写配置的程序，更新备份：

```bash
./install.sh --export all
```

`backup/` 不进入 Git，必须随仓库完整手动迁移，包含 pacman 清单、AVS 固件、Codex、账户与钱包快照以及源码和软件包归档。仅克隆 Git 仓库不能完整恢复。

```bash
./install.sh --plan          # 复现顺序
./install.sh --help          # 所有入口
./install.sh --check --all   # 检查配置冲突，不写入
```

- [Arch ISO 安装](docs/ARCH_INSTALL.md)：分区挂载、基础系统和启动配置。
- [软件与本地包](packages/README.md)：来源、构建和更新方式。
- [Qt / Plasma](qt-plasma/README.md)、[本地源码](local/.local/src/README.md)、[硬件](hardware/README.md)。
- [应用入口与数据](docs/APPLICATIONS.md)、[主题切换](THEME.md)。

安装器测试以普通用户运行，需要 Python 和 GNU Stow：

```bash
python3 -B -m unittest discover -s tests -v
```
