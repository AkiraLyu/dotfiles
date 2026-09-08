# 应用入口与数据目录

EasyEffects 的四份输出预设保存在 `tools/.local/share/easyeffects/output/`，部署后对应 `~/.local/share/easyeffects/output/`。v8 将预设移至数据目录，设置数据库仍由应用写入，见 [上游迁移说明](https://github.com/wwmm/easyeffects/discussions/4396)。部署不自动切换音频效果。

`local/.local/share/applications/` 保存 OneDrive、微信、Typora、亮度快捷键、Steam 与主题入口；Kate 的 `kate -b` 覆盖归入 `qt-plasma/templates/`，由 `./install.sh --restore kde` 复制为独立用户入口。Kate 生成的会话动作只影响运行文件，重复恢复也保留运行副本。Typora 使用 `firejail --noprofile --net=none`。浏览器、Steam 游戏、Waydroid 和 Wine 自动生成的快捷方式由对应应用重新生成。

OneDrive 使用 PATH 中的 `dotfiles-onedrive` 入口，脚本按当前 HOME 找到托盘程序。OneDrive/微信图标保存在 hicolor 标准路径，通过 `dotfiles-onedrive`、`dotfiles-wechat` 名称查找；原图标文件名保留相对链接以兼容已有调用。修改入口后可运行：

```bash
update-desktop-database "$HOME/.local/share/applications"
kbuildsycoca6 --noincremental
```

## rclone 挂载

先运行 `./install.sh --restore private` 恢复账户。挂载目录需要属于目标用户，新机器上准备一次：

```bash
run0 install -d -o "$(id -u)" -g "$(id -g)" -m 0755 \
  /mnt/network /mnt/network/cache \
  /mnt/network/onedrive /mnt/network/cache/onedrive \
  /mnt/network/webdav /mnt/network/cache/webdav \
  /mnt/network/webdav-remote /mnt/network/cache/webdav-remote
```

| 入口 | remote | 挂载点 | 缓存 |
| --- | --- | --- | --- |
| `cloud/rclone/onedrive.sh` 或 OneDrive 桌面入口 | `onedrive:` | `/mnt/network/onedrive` | `/mnt/network/cache/onedrive` |
| `cloud/rclone/webdav.sh` | `WebDAV:` | `/mnt/network/webdav` | `/mnt/network/cache/webdav` |
| `cloud/rclone/webdav-remote.sh` | `WebDAV-remote:` | `/mnt/network/webdav-remote` | `/mnt/network/cache/webdav-remote` |

表中脚本位于 `~/.local/scripts/`。`onedrive.sh` 调用 `onedrive.py --mount-only`，仅挂载，不启动托盘。桌面入口通过已有用户服务管理挂载和托盘。两套 WebDAV 独立使用目标和缓存；这些目录中的远程内容及缓存不是私有配置快照的一部分。

## Wine 前缀

Fish 和 `apps/wine/setup-graphics.sh` 统一默认 `WINEPREFIX=$HOME/wine-pfx/default`，显式传入其他 WINEPREFIX 时保留该选择；图形组件安装失败立即停止。已有 `wine-pfx/1diary`、`wine-pfx/xlj` 和其快捷方式继续使用各自前缀。Wine 应用及前缀数据仍须随个人数据迁移。

## FoxVault 与 Mirador

FoxVault 只使用 `foxvault-git` 包提供的 `/usr/bin/FoxVault` 和 `foxvault.service`。配置保存在 `tools/.config/FoxVault/config.toml`，通过 `install.sh tools` 部署；导出数据仍在 `backup/FoxVault-exports/`。上游不展开 output_dir 中的 `~`，移动仓库或更换用户名后需修改该绝对路径。`FoxVault --show` 打开已有历史。

导出使用 `systemctl --user start foxvault.service`。当前 Firefox 运行时锁定 places.sqlite，需退出 Firefox 后重试；service 最多等待 2 分钟。已有导出数据会保留，仓库不再提供另一份同名用户 unit。

Mirador 的唯一安装入口是 `--restore cargo`；`--restore private` 恢复账户配置和 KWallet。配置与固定提交配套使用 `backend`、`folder`、`on-message-added` 字段。通知 helper 和图标随 `install.sh local` 部署，用户 unit 随 `--user-targets` 部署。钱包解锁、图形会话启动后检查并运行：

```bash
mirador doctor Akira
systemctl --user start mirador.service
journalctl --user -u mirador.service -n 20
```

服务直接运行 `~/.cargo/bin/mirador`，监听 Akira 的 INBOX；配置中的 `backend.watch.timeout = 120` 每两分钟刷新 IDLE，失败后由服务等待 30 秒重试，随图形会话停止。hook 在后台运行通知 helper 并关闭继承的输入输出，让监听循环继续工作。通知只接收 IMAP 数字 UID，再从同一配置读取账户并只读获取邮件标题和预览。通知仅保留默认“查看”操作，通过 `gtk-launch chrome-fmgjjmmmlfnkbppncabfkddbjimcfncm-Default` 启动本机 Gmail PWA。

新机器需先在 Chrome 的 Default profile 安装 Gmail PWA；若生成的 desktop ID 不同，修改 helper 中的 `GMAIL_DESKTOP_ID`。仓库不再提供另一个 Gmail desktop 入口。

## 外部加密备份

`~/.local/scripts/backup/encrypted/system-backup.sh` 将 `/data` 和选定的 HOME 子目录直接同步到 `/mnt/backup/BackUp/`，每次覆盖 `backup.log`。rsync 的 `--delete` 会删除备份中源目录已不存在的文件。它先调用同目录 `mount.sh`，按该文件的固定数据盘 UUID 挂载 `/mnt/data/backup_container.img`；换盘后需核对参数。脚本直接返回命令错误，不重试或回滚。

文档直接存放在 `/data`，对应备份目录为 `BackUp/data/`，包含其中的 `Games` 和 `Library`。目录内部的符号链接仍按链接保存。

这是独立于 `install.sh` 和仓库 `backup/` 的备份入口，不由软件恢复自动运行。备份正在使用的 Codex 前，应先退出应用并运行 `install.sh --export codex`，保留可校验的数据库快照。
