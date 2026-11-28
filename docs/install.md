# 安装指南

[返回 README](../README.md)

在已完成基础系统安装、网络配置并配置好普通用户 `run0` 权限认证的 Arch Linux 上，将本仓库克隆至 `~/dotfiles`，以普通用户身份在仓库根目录下按本页顺序逐项运行 `./install.sh` 的子步骤即可恢复完整工作环境。所有步骤均可在步骤名前附加 `--check` 参数预览待执行的操作。若将仓库放置在 `~/dotfiles` 以外的路径，部署前需同步修改启动器和辅助脚本中引用的仓库路径。

## 准备环境

恢复完整软件包清单前，需先按照目标机器的硬件架构配置软件源、镜像列表与签名密钥环。仓库中的 [etc/pacman.conf](../etc/pacman.conf) 启用了以下软件源：

| 软件源 | 准备事项 |
| --- | --- |
| `core`、`extra`、`multilib` | 使用系统已有的 `/etc/pacman.d/mirrorlist` |
| `archlinuxcn` | 添加镜像地址并安装 `archlinuxcn-keyring`，参见[上游说明](https://github.com/archlinuxcn/repo#usage) |
| `cachyos-v4`、`cachyos-core-v4`、`cachyos-extra-v4`、`cachyos` | 按 [CachyOS 说明](https://wiki.cachyos.org/features/optimized_repos/)确认 CPU 支持 `x86-64-v4`，并配置密钥环与 `/etc/pacman.d/cachyos*-mirrorlist` |

`etc/pacman.conf` 引用了 `/etc/pacman.d/cachyos-v4-mirrorlist` 与 `/etc/pacman.d/cachyos-mirrorlist`，这两个镜像列表文件由 CachyOS 源初始化流程生成。配置文件同时设置了 `IgnorePkg = dolphin pacman dae-git`，恢复环境或更换软件源组合时，可按目标机器的实际需求调整忽略列表与包清单。`archlinuxcn` 源的配置片段如下：

```ini
[archlinuxcn]
Server = https://mirrors.ustc.edu.cn/archlinuxcn/$arch
```

软件源与密钥环准备就绪后，安装基础构建与部署工具并克隆仓库：

```bash
run0 pacman -Syu --needed git stow base-devel paru
git clone https://github.com/AkiraLyu/dotfiles.git "$HOME/dotfiles"
cd "$HOME/dotfiles"
```

## 部署步骤

### 软件包

确认 `packages/` 目录下的四份软件包清单适用当前机器后，执行以下命令检查并恢复软件包：

```bash
./install.sh --check packages
./install.sh packages
```

该步骤调用 [scripts/packages.sh](../scripts/packages.sh) 先通过 `pacman -Syu --needed` 完整升级系统并安装软件源中的显式包与依赖包，随后使用仓库的 Paru 配置刷新自有 PKGBUILD 仓库并安装 `foreign` 列表中的 AUR 包与自有配方包，最后通过 `pacman -D` 统一还原所有软件包的显式安装与依赖安装标记。Rust Nightly 工具链与 Cargo 安装的程序需在包清单恢复后按[软件包与源码](packages.md)单独安装。

### 用户配置

日常应用与 Shell 环境通过 `user` 步骤链接到家目录：

```bash
./install.sh --check user
./install.sh user
```

`user` 分组包含以下配置包：

| 包 | 内容 |
| --- | --- |
| `fish`、`kitty`、`fontconfig` | Fish Shell、Kitty 终端与字体渲染配置 |
| `chromium` | Chrome、Chromium、Electron、ChatGPT 与 QQ 的启动参数文件 |
| `foxvault`、`mpv`、`yazi`、`yt-dlp`、`zathura` | 日常工具与媒体应用配置 |
| `wireplumber` | ALSA 音频输出设备切换规则 |
| `paru` | Paru 选项与远端 `pkgbuilds` 软件源声明 |
| `local` | 个人脚本、桌面启动器与自定义光标图标 |

部署完 `fish` 配置后，如需将 Fish 设为默认登录 Shell，可自行运行 `chsh -s /usr/bin/fish`。若 `--check` 模式提示家目录中已存在新系统默认生成的同名文件，先比对内容并移开冲突文件后再运行正式部署。

### 开发配置

开发环境与辅助脚本通过 `dev` 步骤链接到家目录：

```bash
./install.sh --check dev
./install.sh dev
```

`dev` 分组包含 `clang-format`、`code`、`git`、`nvim` 和 `scripts` 五个配置包，分别提供代码格式化规则、VS Code 启动参数、Git 全局配置、Neovim 配置以及开发辅助脚本。其中 `git` 包内置了个人提交姓名与邮箱，供其他账户使用时需先修改 `dev/git/.gitconfig`。`user` 与 `dev` 步骤均支持在步骤名后指定一个或多个包名，仅部署选中的配置子集：

```bash
./install.sh --check user fish kitty
./install.sh user fish kitty
./install.sh --check dev git nvim
./install.sh dev git nvim
```

### KDE

在登录 KDE Plasma 会话后执行 `kde` 步骤，可一次性完成本地文件链接、远端组件安装与桌面设置写入：

```bash
./install.sh --check kde
./install.sh kde
```

该步骤先将 `de-wm/kde/` 中的 Portal 配置、D-Bus 服务和会话脚本链接到家目录，接着通过 Paru 刷新远端 `pkgbuilds` 仓库并安装 `kde-config` 与 `kde-mimeapps-export-git`，最后运行 `kde-config` 应用 Darkly 主题、KWin 规则、Kate 启动器并启用微信毛玻璃特效。明暗主题切换、文件关联导出与应用补丁的日常维护见[桌面与应用](desktop.md)。若仅需链接仓库内的本地 KDE 文件，可执行：

```bash
./install.sh --check de-wm kde
./install.sh de-wm kde
```

### Niri

在安装好 Niri、Noctalia 及剪贴板工具后，执行以下命令部署 Niri 会话配置：

```bash
./install.sh --check de-wm niri
./install.sh de-wm niri
```

该步骤将 `de-wm/niri/` 中的 KDL 配置文件、Portal 规则、`personal-niri.target` 及专用用户服务按[逐文件链接](#链接规则)方式部署到家目录，并运行 `systemctl --user daemon-reload` 重载单元文件。`personal-niri.target` 通过 `niri.service.wants/` 随 Niri 会话自动启动，负责拉起 Noctalia 外壳与文本、图片剪贴板监听服务；Polkit 认证代理与通用图形会话服务则由下文的 `systemd` 步骤统一部署。Noctalia 的用户配置与生成的 `noctalia.kdl` 恢复及配置校验方法见 [Niri](desktop.md#niri)。

### Umbriel

在安装好 `umbriel-git`、`xdg-desktop-portal-umbriel-git` 和 `noctalia-akira-git` 后，执行以下命令部署 Umbriel 会话配置：

```bash
./install.sh --check de-wm umbriel
./install.sh de-wm umbriel
```

该步骤将 `de-wm/umbriel/` 中的 `config.toml`、`configs/` 模块化子配置、`shaders/` 动画着色器、Portal 规则和 XWayland 资源加载脚本按[逐文件链接](#链接规则)方式部署到家目录。Umbriel 会话启动时通过 `configs/general.toml` 的 `autostart` 列表自动拉起 Noctalia、`kwalletd6` 与 XWayland 资源脚本，并由下文 `systemd` 步骤中的 `polkit-agent.service` 提供认证代理。配置文件校验与服务检查方法见 [Umbriel](desktop.md#umbriel)。

### Firefox

先启动一次 Firefox 以生成配置目录，在地址栏访问 `about:profiles` 找到目标配置的根目录路径（包含 `prefs.js` 的目录），关闭 Firefox 后将该路径传给 `firefox` 步骤：

```bash
./install.sh --check firefox "/实际的/Firefox/配置根目录"
./install.sh firefox "/实际的/Firefox/配置根目录"
```

脚本会将 `user/firefox/` 中的 `user.js`、`chrome/` 界面样式以及扩展规则文件链接到该配置根目录。账户数据、书签与扩展列表通过 Firefox Sync 同步，扩展规则的手动导入方式见 [Firefox 配置](desktop.md#firefox)。

### 系统配置

部署 `/etc` 下的系统配置前，先对照[机器配置](system.md#机器配置)核对根分区与休眠分区 UUID、CPU 编译架构、EFI 挂载点及声卡电源参数，再通过 `etc diff` 比较实机文件与仓库文件的差异：

```bash
./install.sh etc diff
./install.sh --check etc
./install.sh etc
```

确认差异无误后运行 `./install.sh etc`，脚本会按预设规则将受管文件链接或复制到 `/etc`。按需部署单个文件、将实机修改导回仓库、安装 Intel AVS 固件以及重建统一内核镜像（UKI）的操作说明见[系统配置](system.md)。

### 私密配置

将单独备份的私密文件迁入仓库根目录下的 `private/` 后，执行以下命令建立家目录链接：

```bash
./install.sh --check private
./install.sh private
```

该步骤在校验目录结构后，调用 GNU Stow 将 `private/` 中的 Fish 凭据（`.config/fish/conf.d/chromium.fish`）、Carillon 邮箱配置、rclone 远端配置和 KWallet 密钥库逐文件链接到家目录，同时忽略 `firmware/`、`bot` 以及 `.pem` 文件。`private/bot` 由 `git-bot` 脚本直接从仓库路径读取；GitHub App 私钥需复制到 `~/.config/github-app/private-key.pem` 并设置 `0600` 权限，供 `github-app-token` 调用；Intel AVS 声卡固件则通过 `./install.sh firmware` 复制到 `/usr/lib/firmware`。

### 用户服务

在恢复各服务所需的依赖程序、私密配置和挂载目录后，先审阅 `user/systemd/.config/systemd/user/` 下各 target 文件的 `Wants=` 列表，再运行以下命令部署用户服务：

```bash
./install.sh --check systemd
./install.sh systemd
```

该步骤将用户服务单元与 target 依赖链接部署到家目录，并运行 `systemctl --user daemon-reload` 重载配置。各 target 中未注释的 `Wants=` 条目会在下次进入对应会话时自动拉起关联服务：

| target | 启动时机 |
| --- | --- |
| `personal-background.target` | 用户服务管理器的 `default.target` 启动时 |
| `personal-graphical.target` | 图形会话 `graphical-session.target` 启动时 |

target 列表引用的部分服务单元（如 `foxvault.service` 和 `theme-sync.service`）由对应软件包提供；`polkit-agent.service` 包含在 `user/systemd/` 中，根据 `XDG_CURRENT_DESKTOP` 条件在 Niri 与 Umbriel 会话中启动 KDE 认证代理；OneDrive 挂载服务依赖已恢复的 rclone `onedrive` 远端配置，并要求当前用户对 `/mnt/network/onedrive` 和 `/mnt/network/cache/onedrive` 具有写权限。修改 target 的启用项后重新运行 `./install.sh systemd` 即可更新依赖，在当前图形会话中也可直接通过 `systemctl --user` 手动启动服务：

```bash
systemctl --user start carillon.service
systemctl --user status carillon.service
```

## 链接规则

仓库中所有基于 GNU Stow 的部署步骤均传入 `--no-folding --restow` 参数。该模式保留家目录中的各级真实目录，只为具体配置文件创建指向仓库的相对符号链接，并在重新部署时将已有的 Stow 目录链接展开为真实目录；遇到未受 Stow 管理的符号链接或内容不同的普通文件时，Stow 会将其视作冲突并中止操作，以确保本地已有文件安全。

为了保证应用在 `~/.local/share/` 下生成的启动器、图标缓存和运行数据留在本地家目录，源包中的 `.local/` 与 `.local/share/` 必须是真实目录，且 `.local/share/` 内部的源符号链接只允许指向普通文件。安装脚本在正式执行或模拟 Stow 部署前都会通过 `check_share_sources` 校验这一条件，防止源包中的目录符号链接绕过 `--no-folding` 规则。此外，Fish 历史记录、通用变量、私密凭据与 Neovim 的 `lazy-lock.json` 已在脚本的 `--ignore` 参数与 `.stow-local-ignore` 中排除，由各程序在家目录中独立维护。

## 检查模式

| 步骤 | `--check` 的行为 |
| --- | --- |
| `user`、`dev`、`de-wm kde`、`de-wm umbriel` | 校验包名、源包 `.local/share` 结构与符号链接，再以 `--simulate` 模拟 Stow 部署 |
| `de-wm niri` | 校验源包结构并模拟 Niri 配置的 Stow 部署，再显示 `daemon-reload` 命令 |
| `systemd` | 校验源包结构并模拟用户服务的 Stow 部署，再显示 `daemon-reload` 命令 |
| `firefox` | 检查目标配置目录及 `prefs.js` 是否存在，再模拟 Stow 部署 |
| `packages` | 双向比对本机已安装包与 `packages/` 清单，列出清单中尚未安装的包及本机尚未记录的包 |
| `kde` | 模拟本地 KDE 配置的 Stow 部署，再显示 Paru 安装与 `kde-config` 命令 |
| `etc install`、`firmware` | 按清单显示待执行的 `run0` 链接、复制、`systemd-hwdb` 更新与 `systemctl daemon-reload` 命令 |
| `private` | 检查 `private/` 私密配置与 `.local/share` 结构，再模拟 Stow 部署 |
| `etc export` | 检查实机 `/etc` 文件状态，对需要同步的独立文件显示普通复制或 `run0` 复制命令 |

`./install.sh etc diff` 本身即为只读操作，直接输出仓库文件与实机 `/etc` 文件的内容及权限差异。
