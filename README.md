# Arch 配置复现

从已经装好的 Arch Linux 开始，逐步恢复当前手动整理的配置。入口是 `install.sh`，包清单由 `scripts/packages.sh` 管理。脚本都有中文注释，直接调用 Stow、pacman、Paru 和 KDE 自带工具。

`dotfile/` 是旧仓库存档，包含旧脚本和私密备份，已从新仓库的 Git 和安装流程中排除。后续需要哪一项，再单独整理进根目录。

## 当前纳入的内容

| 目录 | 内容 | 部署方式 |
| --- | --- | --- |
| `fish/` | Shell、提示符、配色和环境变量 | HOME 内的逐文件相对链接 |
| `fontconfig/` | 字体替换、回退与渲染规则 | HOME 内的逐文件相对链接 |
| `chromium/` | Chromium、Chrome、Electron、Code、QQ 启动参数 | HOME 内的逐文件相对链接 |
| `local/` | 已手动迁入的用户脚本、启动器和源码 | HOME 内的逐文件相对链接 |
| `systemd/` | 用户 service；通过 target 的 Wants 选择启动项 | 单独选择 systemd 步骤部署 |
| `firefox/` | user.js、CSS、首页及已保存的过滤规则 | 链接到明确指定的 Firefox profile |
| `etc/` | 软件源、构建参数、引导、硬件及登录配置 | 按用途链接或复制；支持比较、部署和导出 |
| `packages/` | 当前包清单 | pacman / Paru；自有配方在远端 pkgbuilds |
| `backup/private/` | Chromium/API 凭据 | 手动迁移后复制，权限 0600，不进入 Git |
| `private/` | Carillon 等手动迁入的私密配置 | 不进入 Git；随重装手动迁移 |
| `private/firmware/` | Intel AVS 固件 | 手动迁入后直接复制到 `/usr/lib/firmware/` |

## 复现顺序

1. 安装 Arch，准备网络、软件源和 keyring。`etc/pacman.conf` 保存实机配置，启用 `core`、`extra`、`multilib`、`archlinuxcn`，并保留当前 `IgnorePkg = dolphin`。官方源使用新系统的 `/etc/pacman.d/mirrorlist`；本机额外软件源如下，添加源后还需要正确配置 `archlinuxcn-keyring`：

   ```ini
   [archlinuxcn]
   Server = https://mirrors.ustc.edu.cn/archlinuxcn/$arch
   ```

2. 安装基础工具，并将仓库放到 `~/dotfiles`：

   ```bash
   run0 pacman -Syu --needed git stow base-devel paru
   cd ~/dotfiles
   ```

3. 检查包清单，再安装软件：

   ```bash
   ./install.sh --check packages
   ./install.sh packages
   ```

   当前 Rust 使用 nightly 工具链；包清单恢复的是 rustup 程序，工具链单独执行 `rustup default nightly`。Flatpak 微信另行安装，见下面的插件说明。

4. 检查并部署已经整理的用户配置：

   ```bash
   ./install.sh --check home
   ./install.sh home
   ```

5. 登录 Plasma 后，从 GitHub 安装 KDE 插件、主题及设置：

   ```bash
   ./install.sh --check kde
   ./install.sh kde
   ```

   自有源码和配置位于 [kde-plugins](https://github.com/AkiraLyu/kde-plugins)，配方位于 [pkgbuilds](https://github.com/AkiraLyu/pkgbuilds)。Paru 从远端构建后由 pacman 安装。`kde-config` 包安装 App Grid、可调任务管理器、Kate / WeChat 插件及 Darkly Translucent，配置命令设置微信 XWayland override 并应用当前用户的外观。只重新应用设置时运行 `kde-config`。

6. 启动 Firefox 一次，在 `about:profiles` 找到正在使用的根目录。下面是本机当前路径，换机器时替换它：

   ```bash
   ./install.sh --check firefox "$HOME/.config/mozilla/firefox/d40lett3.default-release"
   ./install.sh firefox "$HOME/.config/mozilla/firefox/d40lett3.default-release"
   ```

   首页地址仍写在 `firefox/user.js` 中；用户名或仓库位置改变时，手动修改该文件的 `browser.startup.homepage`。账户、扩展和书签通过 Firefox Sync 恢复。

7. 比较 `etc/` 与新系统配置，核对 `cmdline.d/root.conf` 中的磁盘 UUID 和 UKI 的 `/efi` 路径，再执行系统文件复制：

   ```bash
   ./install.sh etc diff
   ./install.sh --check etc
   ./install.sh etc
   ```

   此步骤按下面的规则链接或复制清单中的系统文件，保留执行权限；包含键位文件时更新 hwdb。键位、PAM 环境和 TLP 的生效时机各不相同，部署后重新登录或重启验证。

   将 AVS 固件迁入 `private/firmware/intel/avs/tgl/dsp_basefw.bin` 后，直接复制到 `/usr/lib/firmware/intel/avs/tgl/dsp_basefw.bin`：

   ```bash
   ./install.sh --check firmware
   ./install.sh firmware
   ```

   修改引导配置或固件后，确认 `/efi` 已挂载，再手动运行 `run0 mkinitcpio -P` 重建 UKI。

8. 需要凭据时，手动迁入 `backup/private/chromium.fish`，再执行：

   ```bash
   ./install.sh private
   ```

9. 恢复用户 systemd 文件：

   ```bash
   ./install.sh --check systemd
   ./install.sh systemd
   ```

   target 中未注释的 `Wants=` 决定随会话启动哪些服务。对应程序、私密配置和路径恢复后，再按需取消相关行的注释。此步骤只部署文件和 `daemon-reload`；当前会话首次启用某个服务时，单独执行 `systemctl --user start 服务名`。

普通配置用 Stow 建立链接，修改仓库文件即可影响使用它的应用。若目标已有不同的独立文件，Stow 会显示冲突；比较后手动决定保留哪份。安装入口不覆盖这类用户文件，也不使用 `--adopt`。Fish 的 `fish_variables`、历史和凭据保留为 HOME 内的独立文件。

## /etc 日常维护

`install.sh` 中的 `system_files` 是唯一清单，新增文件时在此登记。`environment` 和 `makepkg.conf.d/90-local.conf` 链接到仓库，编辑即同步。其余文件复制到 `/etc`，实机修改后显式导出。引导、PAM 限制、包管理和早期 udev 配置保留独立副本；TLP 的服务设置了 `ProtectHome=yes`，也必须复制。

```bash
./install.sh etc diff                   # 比较仓库与实机，包含权限差异
./install.sh --check etc export         # 预览实机 → 仓库的复制命令
./install.sh etc export                 # 将已管理的实机文件同步回仓库
./install.sh etc export pacman.conf     # 也可以只同步指定文件
./install.sh etc install pacman.conf    # 将指定仓库文件部署到实机
```

导出跳过已经链接到仓库的文件，尚未部署的文件保留仓库版本；其他文件以实机内容为准覆盖仓库，因此先看 `diff`。本次已同步 `pacman.conf`、`mkinitcpio.conf` 和 `linux.preset`，保留实机的 Plymouth 与 UKI 设置。

编译设置移到 `makepkg.conf.d/90-local.conf`，保留原来的 `x86-64-v4`、并行数、构建目录和打包者；内存锁定设置移到 `security/limits.d/90-memlock.conf`。其余默认值由软件包维护，采用 [makepkg](https://man.archlinux.org/man/makepkg.conf.5.en) 和 [PAM](https://man.archlinux.org/man/limits.conf.5.en) 自带的配置片段机制。清单中的 11 个文件均已部署：2 个相对链接、9 个独立副本。换机器时检查 CPU 架构、声卡参数和磁盘 UUID。

触控板修复保存在已部署的 `initcpio/install/block`：省略 `drivers/mfd`，其余行为与本机 mkinitcpio 41.1 一致，已去掉旧的动态函数替换。它位于 mkinitcpio 优先读取的 `/etc/initcpio/install/`，原理见 [mkinitcpio 手册](https://man.archlinux.org/man/mkinitcpio.8.en)。`/usr/lib/initcpio/install/block` 已恢复为包原文件并核对摘要；以后 mkinitcpio 更新时比较原版 hook，手动合入其他变化并保留 `drivers/mfd` 的注释。本次已重建 UKI，确认镜像包含 Plymouth 和声卡配置，未包含 `drivers/mfd` 模块；硬件效果在下次重启后验证。

## Darkly 明暗切换

```fish
theme light    # Darkly + LayanLight
theme dark     # Darkly + Layan
theme toggle   # 切换明暗
theme apply    # 重新应用保存的模式；首次默认 light
theme status   # 查看保存模式及当前 KDE 配色
```

命令由远端 `kde-config` 包提供：`darkly-theme`。Fish 的 `theme` 函数调用它并同步当前终端配色。Qt 控件和窗口装饰固定为 Darkly，GTK 同步明暗偏好，模式保存在 `~/.local/state/theme/mode`。启动器提供“Darkly 明暗切换”。

`darkly-translucent` 包将基于 Darkly 0.5.39 的静态主题安装到 `/usr/share/plasma/desktoptheme/`。Layan、Darkly 本体、Better Blur DX、Rounded Corners 等第三方包继续使用现有软件源或 AUR 配方。

## KDE 插件和补丁

`kde-plugins` 仓库是源码和 KDE 配置的唯一维护位置，dotfiles 不保存副本或本地 PKGBUILD。安装入口为 `./install.sh kde`；已有包需要重编译时：

```bash
paru --sudo run0 --rebuild -S appgrid adjustable-task-manager kate-translucent-bars wechat-glass-live
kde-config
```

Kate 启动器 `kate-translucent` 启用会话的透明边栏插件，用户 desktop 入口由 `kde-config` 设置。WeChat Glass 支持 XWayland 微信，本机应用为 Flatpak `com.tencent.WeChat`，默认栏背景不透明度 0.52。状态和参数通过以下命令管理：

```bash
wechat-glass-control status
wechat-glass-control opacity 0.52
```

微信后端 override 需要完全退出微信再打开才能生效。KWin ABI 更新后重编译 `wechat-glass-live` 并重新登录。原生模块更新后重新打开对应应用。

`chatgpt-desktop` 从 AUR 安装。独立的 `chatgpt-translucent-bars` 包通过 pacman 钩子，在应用或补丁包更新后重新应用透明栏补丁。升级后重新打开 ChatGPT；无需手动运行补丁或保留旧 ASAR 备份。该补丁会修改应用的 ASAR，完整性检查会报告这个预期改动。


## Carillon 邮件提醒

Mirador 已更名为 [Carillon](https://github.com/pimalaya/carillon)。当前配置按本机的 `0.1.0`、提交 `b431f9f793eecdb6e65cc5437318152a7def02c0` 验证；复现同一版本可运行：

```bash
cargo install --locked --git https://github.com/pimalaya/carillon.git --rev b431f9f793eecdb6e65cc5437318152a7def02c0 carillon
```

私密配置位于 `private/.config/carillon/config.toml`，当前链接到 `~/.config/carillon/`，重装时需手动迁入并恢复该链接。新版使用 `accounts.Akira.imap` 配置服务器、SASL 认证、`mailbox` 和 `hook`；旧 `backend` 格式不能直接沿用。Fish 已将 `~/.cargo/bin` 加入 PATH。

```fish
carillon --account Akira check
systemctl --user restart carillon.service
systemctl --user status carillon.service
```

服务通过 `CARILLON_CONFIG`、`CARILLON_ACCOUNT` 与通知脚本共享设置，使用 `--account Akira watch` 监听配置中的 INBOX。通知钩子把环境变量 `$id` 交给 `carillon-gmail-notify`；脚本只读邮件预览，点击通知通过 `gtk-launch` 打开已安装的 Gmail PWA。

## 软件包怎么维护

四份包清单每行一个包名，不包含版本；修改软件组合后运行：

```bash
./scripts/packages.sh export
```

- `repo.txt` / `repo-deps.txt`：当前软件源中的显式安装包 / 依赖包。
- `foreign.txt` / `foreign-deps.txt`：当前软件源中没有的显式安装包 / 依赖包。
- 自有 PKGBUILD：统一在 [pkgbuilds](https://github.com/AkiraLyu/pkgbuilds)，包括四个元包、KDE 组件、ChatGPT 透明栏补丁、Gamescope、WPS、知乎导出器和拾光日记。`chatgpt-desktop` 本体继续由 AUR 维护。修改配方后重新生成 `.SRCINFO`。

恢复时先安装软件源包，再用 Paru 从 pkgbuilds / AUR 安装 foreign 包，最后恢复安装原因。`--check packages` 仅检查本机是否已安装记录的包名；它不验证远端包是否仍可获得。这是滚动更新的包清单，不承诺重装出完全相同的旧版本。

磁盘分区、挂载和 EFI 启动项由新系统安装流程准备；软件组合以 `packages/` 的四份清单为准。KDE 配置和已有独立 GitHub 来源的源码由各自仓库维护；拾光日记源码仍在本仓库，远端配方从 GitHub 拉取。
