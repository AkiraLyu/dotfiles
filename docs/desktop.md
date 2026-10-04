# 桌面与应用

[返回 README](../README.md)

本页介绍完成[配置部署](install.md)后的桌面操作和应用恢复。除特别说明外，仓库脚本从仓库根目录执行，桌面命令在当前用户的图形会话中执行。

## KDE

`./install.sh kde` 安装 KDE 配置和应用补丁，再运行 `kde-config`。插件源码和设置由 [kde-plugins](https://github.com/AkiraLyu/kde-plugins) 维护，Arch 配方由 [pkgbuilds](https://github.com/AkiraLyu/pkgbuilds) 维护。

`kde-config` 应用 Darkly、KWin 和 KDE 设置，配置 Kate 启动器，并为已安装的 Flatpak 微信设置 XWayland 启动参数。只重新应用设置时运行：

```bash
kde-config
```

已有原生插件需要重新编译时执行：

```bash
paru --sudo run0 --rebuild -S appgrid adjustable-task-manager kate-translucent-bars wechat-glass-live
kde-config
```

安装新原生模块后重新打开对应应用；KWin ABI 更新后重新编译相关效果插件并重新登录。

### 明暗主题

在 Fish 中使用 `theme`：

```fish
theme light    # Darkly 控件与 LayanLight 配色
theme dark     # Darkly 控件与 Layan 配色
theme toggle   # 切换明暗
theme apply    # 应用保存的模式；首次默认 light
theme status   # 查看保存模式和当前 KDE 配色
```

Fish 函数调用 `kde-config` 包提供的 `darkly-theme`，成功切换后同步当前终端的提示符和配色。其他 Shell 可直接使用 `darkly-theme` 的同名子命令。

Qt 控件和窗口装饰使用 Darkly，GTK 同步明暗偏好，Plasma 样式使用 `darkly-translucent`。模式保存在 `$XDG_STATE_HOME/theme/mode`，未设置该变量时为 `~/.local/state/theme/mode`；应用启动器也提供“Darkly 明暗切换”。

### 应用补丁

| 应用 | 组件 | 用法 |
| --- | --- | --- |
| Kate | `kate-translucent-bars` | `kate-translucent` 启动器启用透明边栏插件；桌面入口由 `kde-config` 设置 |
| 微信 | `wechat-glass-live` | 为 XWayland 微信提供透明效果，通过 `wechat-glass-control` 管理 |
| ChatGPT Desktop | `chatgpt-translucent-bars` | 应用或补丁包更新后，由 pacman 钩子重新应用 ASAR 补丁 |

微信使用 Flatpak 应用 `com.tencent.WeChat`，需要单独安装。安装后运行 `kde-config` 设置 XWayland 参数，再完全退出并重新打开微信。效果状态和背景不透明度通过以下命令管理：

```bash
wechat-glass-control status
wechat-glass-control opacity 0.52
```

`chatgpt-desktop` 本体来自 AUR。补丁会修改其 ASAR 文件，因此完整性检查可能报告这一改动。更新后重新打开应用，无需手动运行补丁。

## Firefox

`firefox` 步骤将 [firefox/](../firefox/) 的文件链接到指定配置目录，包括 `user.js`、`chrome/` 样式、首页和扩展规则文件。脚本不恢复账户、书签或扩展数据库，这些内容通过 Firefox Sync 或单独备份恢复。

[user.js](../firefox/user.js) 的 `browser.startup.homepage` 使用绝对 `file://` 地址。用户名或仓库路径变化时，先修改首页地址，再重启 Firefox。

`sidebery.css` 和 `uBlacklist.txt` 是扩展的规则文件；部署链接不会安装扩展或自动导入这些规则，需要在对应扩展中手动设置。

## Carillon

[Carillon](https://github.com/pimalaya/carillon) 用于监听 IMAP 邮箱并触发桌面通知。仓库的服务和通知脚本使用其 `accounts.<账户名>.imap` 配置结构。

### 程序与配置

安装对应提交：

```bash
cargo install --locked --git https://github.com/pimalaya/carillon.git --rev b431f9f793eecdb6e65cc5437318152a7def02c0 carillon
```

Fish 配置已将 `~/.cargo/bin` 加入 PATH。将私密配置迁入 `private/.config/carillon/config.toml`；在目标目录不存在时，从仓库根目录建立链接：

```bash
mkdir -p "$HOME/.config"
ln -s "$PWD/private/.config/carillon" "$HOME/.config/carillon"
```

目标目录已存在时先比较并处理原配置。`./install.sh private` 只复制 Chromium 凭据，不负责此链接。

配置中的 `accounts.Akira.imap` 需要包含服务器、SASL 认证、`mailbox` 和通知 `hook`。钩子将 `$id` 传给 [carillon-gmail-notify](../local/.local/bin/carillon-gmail-notify)。通知脚本使用 TLS IMAP、`sasl.plain` 及其密码命令读取邮件预览，点击通知时通过 `gtk-launch` 打开 Gmail PWA。

服务的 `CARILLON_CONFIG` 和 `CARILLON_ACCOUNT` 与通知脚本共享配置。更换账户名时，同时修改配置中的账户和 [carillon.service](../systemd/.config/systemd/user/carillon.service) 的 `CARILLON_ACCOUNT`。Gmail PWA 的 desktop ID 定义在通知脚本中，恢复 PWA 后确认它与实际安装项一致。

### 服务

先检查邮箱连接，再按[用户服务](install.md#用户服务)部署 systemd 文件。在图形会话中运行：

```bash
carillon --account Akira check
systemctl --user restart carillon.service
systemctl --user status carillon.service
```

服务通过 `watch` 监听配置中的邮箱。程序不可执行或配置文件不存在时，unit 条件会阻止启动；恢复这些依赖后再重启服务。
