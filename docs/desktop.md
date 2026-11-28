# 桌面与应用

[返回 README](../README.md)

仓库支持 KDE Plasma 6、Niri 和 Umbriel 三种图形会话。KDE 会话的原生插件、主题与配置工具由独立项目维护并通过自有软件源安装，Niri 与 Umbriel 会话则共享 Noctalia 桌面外壳、KDE 认证代理、文件关联导出结果以及通用图形会话服务。除特别说明外，仓库管理脚本在仓库根目录下运行，桌面控制命令在当前用户的图形会话中执行。

## KDE

在 Plasma 会话中运行 `./install.sh kde` 会依次完成三项操作：将 [de-wm/kde/](../de-wm/kde/) 中的本地配置链接到家目录，通过 Paru 从 [pkgbuilds](https://github.com/AkiraLyu/pkgbuilds) 安装 [kde-plugins](https://github.com/AkiraLyu/kde-plugins) 提供的远端组件，最后执行 `kde-config` 写入桌面设置。`kde-config` 会统一应用 Darkly 窗口装饰与控件样式、KWin 规则、Kate 透明边栏启动器，并为已安装的 Flatpak 微信写入 XWayland 启动参数。日常需要重新写入这套桌面设置时，直接运行以下命令即可：

```bash
kde-config
```

当系统升级 KWin 或 Kate 导致 C++ 插件 ABI 变更时，重新编译安装对应的原生插件并重新应用设置，随后重启相关应用或重新登录 Plasma 会话即可恢复效果：

```bash
paru --sudo run0 --rebuild -S adjustable-task-manager kate-translucent-bars wechat-glass-live
kde-config
```

### 文件关联

[kde-mimeapps-export](https://github.com/AkiraLyu/kde-mimeapps-export) 通过 KDE 的 KService 接口查询当前实际生效的默认应用与候选顺序（涵盖用户自定义关联、MIME 类型继承链与 URL 协议处理程序），并将完整结果以原子替换方式写入 `~/.config/mimeapps.list`（或 `$XDG_CONFIG_HOME/mimeapps.list`，也可通过 `--output` 指定输出路径）。由于该工具会将原本依赖 KDE 运行时动态回退的选择显式写出为用户级关联，在 KDE、Niri 或 Umbriel 会话中运行它即可让所有桌面会话共用一致的默认打开方式。`./install.sh kde` 已默认安装该工具；单独安装或更新文件关联时执行：

```bash
paru --sudo run0 -Sy --pkgbuilds
paru --sudo run0 -S kde-mimeapps-export-git
kde-mimeapps-export --dry-run
kde-mimeapps-export
```

### 明暗主题

Fish 中的 `theme` 函数封装了 `kde-config` 软件包提供的 `darkly-theme` 命令（其他 Shell 可直接调用 `darkly-theme`），用于统一管理桌面与终端的明暗配色：

```fish
theme light    # 应用 Darkly 控件与 LayanLight 亮色方案
theme dark     # 应用 Darkly 控件与 Layan 暗色方案
theme toggle   # 在亮色与暗色方案之间切换
theme apply    # 重新应用当前保存的明暗模式，首次运行默认使用 light
theme status   # 查看已保存的模式与当前生效的 KDE 配色名称
```

执行切换时，`darkly-theme` 会将 Qt 控件与 KWin 窗口装饰设为 `Darkly`、Plasma 桌面主题设为 `darkly-translucent`，按目标模式应用 `LayanLight` 或 `Layan` 配色并同步更新 GTK 3/4 的明暗偏好，随后将当前模式记录到 `~/.local/state/theme/mode`（或 `$XDG_STATE_HOME/theme/mode`）；Fish 的 `theme` 函数会在命令执行成功后自动重载当前终端的提示符与 `ls` 配色。图形会话启动时由 `theme-sync.service` 自动调用 `darkly-theme --quiet apply` 恢复上次保存的模式，日常也可通过应用启动器中的 `Darkly 明暗切换` 入口触发切换。

### 应用补丁

| 应用 | 组件 | 作用与用法 |
| --- | --- | --- |
| Kate | `kate-translucent-bars` | 通过 `kate-translucent` 启动器加载透明边栏插件，桌面入口由 `kde-config` 自动配置 |
| 微信 | `wechat-glass-live` | 为运行在 XWayland 下的微信窗口提供实时背景毛玻璃效果，通过 `wechat-glass-control` 调节 |

微信使用 Flatpak 应用 `com.tencent.WeChat`，单独安装后运行一次 `kde-config` 即可写入 XWayland 运行参数，完全退出并重新打开微信后毛玻璃插件即会生效。可通过以下命令查看插件状态或调整背景不透明度：

```bash
wechat-glass-control status
wechat-glass-control opacity 0.52
```

## Niri

[de-wm/niri/](../de-wm/niri/) 保存 Niri 的 KDL 配置文件、Portal 后端配置以及专用 systemd 用户服务，通过 `./install.sh de-wm niri` 部署并重载用户单元，完整步骤见[安装指南](install.md#niri)。主配置文件 [config.kdl](../de-wm/niri/.config/niri/config.kdl) 按模块引入 `configs/` 子目录下的输入、环境变量、快捷键、动画、窗口规则和显示器设置，并在末尾引入 `~/.config/niri/noctalia.kdl`。会话启动时，`personal-niri.target` 通过 `niri.service.wants/` 随 Niri 服务一同拉起，负责管理 `niri-noctalia.service` 及文本、图片剪贴板监听服务；Polkit 认证代理则由 `user/systemd/` 中的 `polkit-agent.service` 统一拉起。

Noctalia 外壳自身的设置与插件由应用在家目录中独立维护，新设备上首次进入会话或恢复 `~/.config/niri/noctalia.kdl` 后，先按实机核对显示器名称与路径配置，再通过以下命令检查配置语法及服务状态：

```bash
niri validate -c "$HOME/.config/niri/config.kdl"
systemctl --user status personal-niri.target niri-noctalia.service
```

## Umbriel

[de-wm/umbriel/](../de-wm/umbriel/) 保存 Umbriel 合成器的主配置、Portal 后端配置及 XWayland 资源脚本，通过 `./install.sh de-wm umbriel` 部署到家目录，完整步骤见[安装指南](install.md#umbriel)。主配置文件 [config.toml](../de-wm/umbriel/.config/umbriel/config.toml) 的快捷键、滚动布局、图层模糊和窗口规则与 Niri 会话保持对齐，同时将 `noctalia.toml` 列在 `[include.optional]` 下并在文件内提供完整的 `[colors]` 默认配色，使新设备在尚未生成 `noctalia.toml` 时也能正常加载配置。会话启动时通过 `[general] autostart` 依次拉起 `noctalia`、`kwalletd6`、`/usr/lib/pam_kwallet_init` 和 `$HOME/.config/umbriel/scripts/xconfig.sh`（合并 `.Xresources` 中的字体 DPI 与光标设置），Polkit 认证代理由 `user/systemd/` 中的 `polkit-agent.service` 随图形会话自动启动。

迁移到其他设备前，先根据 `umbriel outputs` 的实机输出核对显示器名称、分辨率与缩放比例，部署后可通过以下命令校验配置语法与会话服务状态：

```bash
umbriel config validate
systemctl --user status umbriel.service polkit-agent.service
```

## Firefox

运行 `./install.sh firefox PROFILE` 会将 [user/firefox/](../user/firefox/) 下的配置文件链接到指定的 Firefox 配置根目录。其中 [user.js](../user/firefox/user.js) 开启自定义样式支持并将浏览器首页设为内置的 `about:home`，`chrome/` 目录提供隐藏原生标签栏、对齐侧边栏与书签栏以及多容器标签页边框的界面样式，`sidebery.css` 与 `uBlacklist.txt` 则提供扩展样式与搜索结果屏蔽规则。浏览器的账户、书签和扩展列表通过 Firefox Sync 同步恢复；待 Sidebery 与 uBlacklist 扩展安装完成后，在两个扩展的设置页面中手动导入配置根目录下的对应规则文件，并重启 Firefox 即可还原完整界面。

## Carillon

[Carillon](https://github.com/pimalaya/carillon) 用于在后台通过 IMAP IDLE 监听邮箱收件箱并触发桌面通知，仓库中的用户服务与通知脚本围绕其 `accounts.<账户名>.imap` 配置结构协同工作。

### 程序与配置

使用 Cargo 安装仓库验证过的固定提交版本（Fish 配置中的 `env.fish` 已将 `~/.cargo/bin` 加入 `PATH`）：

```bash
cargo install --locked --git https://github.com/pimalaya/carillon.git --rev b431f9f793eecdb6e65cc5437318152a7def02c0 carillon
```

将包含 IMAP 服务器地址、SASL 认证信息、监听邮箱名（`mailbox`）和通知钩子（`hook`）的私密配置文件迁入 `private/.config/carillon/config.toml`，然后运行 `./install.sh private` 将其链接到 `~/.config/carillon/config.toml`。当收到新邮件时，`accounts.Akira.imap` 中的 `hook` 会将邮件 `$id` 传给 [carillon-gmail-notify](../user/local/.local/bin/carillon-gmail-notify)，由通知脚本复用同一份配置文件中的 TLS IMAP 与 `sasl.plain` 密码命令拉取邮件主题和发件人摘要，并发送桌面通知；点击通知时会调用 `gtk-launch` 打开 Gmail PWA（重新安装 Chrome PWA 后需核对脚本顶部的 desktop ID 是否一致）。[carillon.service](../user/systemd/.config/systemd/user/carillon.service) 与通知脚本通过环境变量 `CARILLON_CONFIG` 和 `CARILLON_ACCOUNT` 共享配置路径与账户名，修改配置中的账户名时需同步更新服务单元。

### 服务

先通过命令行测试 IMAP 邮箱连接，再按[用户服务](install.md#用户服务)部署 systemd 单元并在图形会话中启动服务：

```bash
carillon --account Akira check
systemctl --user restart carillon.service
systemctl --user status carillon.service
```

`carillon.service` 设有 `ConditionPathExists` 与 `ConditionFileIsExecutable` 保护条件，当 `~/.cargo/bin/carillon` 与 `~/.config/carillon/config.toml` 均就绪时才会启动后台 `watch` 进程。
