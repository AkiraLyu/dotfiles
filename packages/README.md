# 软件来源与本地包

`pacman-policy.json` 记录本地包、替换和延期；原始四类清单保存在 `backup/pacman/`。恢复顺序与其他管理器的输入见 [RESTORE.md](../RESTORE.md)。

| 包 | 来源与更新 |
| --- | --- |
| `niri-meta` | `pkgbuilds/niri-meta/`；依赖 Noctalia v5 和定制 Xwayland |
| `xwayland-satellite-akira` | `pkgbuilds/xwayland-satellite-akira/`；[AkiraLyu fork](https://github.com/AkiraLyu/xwayland-satellite)，配方固定提交、版本与 SHA256 |
| `gamescope-anime4k` | `pkgbuilds/gamescope-anime4k/`；[AkiraLyu fork](https://github.com/AkiraLyu/gamescope)，固定 `aa770685` 和依赖源码，命令仍为 `gamescope` |
| `foxvault-git` | `pkgbuilds/foxvault-git/`；[AkiraLyu/FoxVault](https://github.com/AkiraLyu/FoxVault)，固定 `ba885c1f`；包提供 `/usr/bin/FoxVault` 和用户 service |
| `dotfiles-kde-plugins` | `--restore kde-plugins` 从集中源码构建；模板在 `qt-plasma/packaging/` |
| `shiguang-diary` | `--restore diary` 从 `local/.local/src/diary/PKGBUILD` 构建 |

`--restore pacman` 包含上述各包。`xwayland-satellite`、`gamescope` 替换为对应 fork 包；搜狗词库按约定跳过；KDE 与日记包不向 AUR 查询。

## 本地优先与更新

`paru.conf` 是模板，`install.sh tools` 或 `--restore pkgbuilds` 为用户生成独立 Paru 配置。本地 `[dotfiles]` 优先于远端个人 `[pkgbuilds]`；Paru 要求绝对路径，移动仓库后重新运行 `install.sh tools`。

```bash
./install.sh --restore pkgbuilds --check
./install.sh --restore pkgbuilds
# 单独构建并安装 Gamescope：
paru --sudo run0 -S dotfiles/gamescope-anime4k
```

`pkgbuilds` 安装表中前四个包。Xwayland 和 FoxVault 使用 Rust 1.96.0 与锁文件；Xwayland 启用 systemd feature。Gamescope 使用固定依赖归档和 Meson；这三个程序均使用通用 CPU 参数。更新时同步修改配方中的 commit、版本和 SHA256，再在配方目录运行 `makepkg --printsrcinfo > .SRCINFO`。不会自动跟随分支；远端个人配方仍独立维护。

Mirador 由 Cargo 管理，固定到 `979944376f851baf22e831eb2b05c2a856b73388`，只启用 IMAP。该提交使用普通 IDLE；后来的 `2b50652` 强制要求 Gmail 未提供的 QRESYNC，不能直接升级过去。工具链、依赖锁文件和私有配置应一起维护，启动说明见 [应用文档](../docs/APPLICATIONS.md)。

KDE 和日记构建器比较源码、运行库版本与已安装文件；一致则跳过，否则重新构建。日记构建执行应用及原生 Wayland 协议测试，排除日记数据、node_modules 和旧输出。安装中断后可重试，只有校验通过的成品才会复用。Qt/KWin 或 Electron/Wayland 升级后还需实际启动验收。

成品按包名保存为 `backup/packages/<包名>/`，KDE 和日记每次成功构建后替换原副本。固定来源的源码压缩包在 `backup/sources/`；成品只适用于兼容的系统库。软件更新并验证后，运行对应 `--export` 更新清单。npm 清单按约定保持现有内容。
