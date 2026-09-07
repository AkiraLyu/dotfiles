# 应用入口与数据目录

EasyEffects 的四份当前输出预设保存在 `tools/.local/share/easyeffects/output/`，部署后对应 `~/.local/share/easyeffects/output/`。旧 `~/.config/easyeffects` 断链已移除，应用可以重新创建自己的设置目录。v8 将预设移至数据目录，设置数据库仍由应用写入，见 [上游迁移说明](https://github.com/wwmm/easyeffects/discussions/4396)。本次保留预设内容，不自动切换音频效果。

`local/.local/share/applications/` 保存 OneDrive、微信、Typora、亮度快捷键、Steam 与主题入口；Kate 的 `kate -b` 覆盖归入 `qt-plasma`。Kate 会话文件仍由 Kate 管理；2026-09-06 复查发现 xv6 会话 Action 已重新进入桌面模板，且动作标识校验失败。当前用户入口链接到仓库，静态模板与应用生成内容尚未隔离，单次删除 Action 无法保证后续不再写入。Typora 保留 `firejail --noprofile --net=none` 启动方式。浏览器、Steam 游戏、Waydroid 和 Wine 自动生成的快捷方式由对应应用重新生成。

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

表中脚本位于 `~/.local/scripts/`。原 `google.sh` 更名为 `onedrive.sh`，复用 `onedrive.py --mount-only`，仅挂载，不启动托盘。桌面入口通过已有用户服务管理挂载和托盘。两套 WebDAV 独立使用目标和缓存；这些目录中的远程内容及缓存不是私有配置快照的一部分。

## Wine 与已退役配置

Fish 和 `apps/wine/setup-graphics.sh` 统一默认 `WINEPREFIX=$HOME/wine-pfx/default`，显式传入其他 WINEPREFIX 时保留该选择；图形组件安装失败立即停止。已有 `wine-pfx/1diary`、`wine-pfx/xlj` 和其快捷方式继续使用各自前缀。Wine 应用及前缀数据仍须随个人数据迁移。

Pot 的三份脚本、应用数据、失效桌面入口和 KDE 快捷键已清理；Niri 中仅删除它的 F1/F2 入口与窗口匹配。QQ 的旧 sandbox 脚本已删除，正常 QQ flags 和服务继续保留。当前已经不存在的 Clash Verge、旧 Claude 路径对应的 URI handler 也已移除，重装相关应用后由应用重新注册。

旧 `dae.service` 定义已经从仓库删除。迁出机若还保留它的历史系统链接，可使用专用清理脚本；脚本只接受指回当前仓库的失效链接，并检查 dae 未运行。应用时重载系统 unit，核对当前 daed 的状态和进程号：

```bash
python3 scripts/remove-retired-dae.py       # 只读预览
run0 python3 scripts/remove-retired-dae.py --apply
```
