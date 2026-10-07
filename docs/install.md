# 安装指南

[返回 README](../README.md)

下列命令以普通用户在仓库根目录执行，Shell 示例使用 Bash。每次明确选择一个安装步骤；运行 `./install.sh` 只显示帮助。

## 准备环境

先完成 Arch Linux 安装，准备网络、挂载、普通用户和可用的 `run0` 权限认证。恢复完整包清单前，按目标机器配置软件源和签名密钥环。

[etc/pacman.conf](../etc/pacman.conf) 保存以下软件源配置：

| 软件源 | 准备事项 |
| --- | --- |
| `core`、`extra`、`multilib` | 使用新系统的 `/etc/pacman.d/mirrorlist` |
| `archlinuxcn` | 配置镜像及 `archlinuxcn-keyring`，参见[上游说明](https://github.com/archlinuxcn/repo#usage) |
| `cachyos-v4`、`cachyos-core-v4`、`cachyos-extra-v4`、`cachyos` | 按 [CachyOS 说明](https://wiki.cachyos.org/features/optimized_repos/)确认 CPU 支持并准备软件源、密钥环和镜像列表 |

仓库配置引用 `/etc/pacman.d/cachyos-v4-mirrorlist` 和 `/etc/pacman.d/cachyos-mirrorlist`，这些文件不由 `etc` 步骤部署。配置中还保留了 `IgnorePkg = dolphin pacman`，使用前确认是否仍需排除这些包。若不使用某个软件源，应同时调整配置和包清单。

`archlinuxcn` 的仓库配置为：

```ini
[archlinuxcn]
Server = https://mirrors.ustc.edu.cn/archlinuxcn/$arch
```

软件源准备完成后，安装基础工具并获取仓库：

```bash
run0 pacman -Syu --needed git stow base-devel paru
git clone https://github.com/AkiraLyu/dotfiles.git "$HOME/dotfiles"
cd "$HOME/dotfiles"
```

已有仓库时直接进入其根目录。默认路径为 `~/dotfiles`；换用其他路径前，检查应用备份目录、启动器和脚本中的绝对路径。

## 部署步骤

### 软件包

先审阅 `packages/` 中的四份清单，再执行：

```bash
./install.sh --check packages
./install.sh packages
```

安装会完整升级系统，再恢复记录的软件包和安装原因。Rust 工具链、Flatpak 应用和 Cargo 安装的程序需要单独恢复，详见[软件包与源码](packages.md)。

### 用户配置

```bash
./install.sh --check user
./install.sh user
```

此步骤部署 `user/` 中以下配置包：

| 包 | 内容 |
| --- | --- |
| `fish`、`kitty`、`fontconfig` | Shell、终端和字体 |
| `chromium` | Chrome、Chromium、Electron、ChatGPT 和 QQ 启动参数 |
| `foxvault`、`mpv`、`yazi`、`yt-dlp`、`zathura` | 日常应用配置 |
| `wireplumber` | 音频设备切换规则 |
| `paru` | Paru 选项和远端 PKGBUILD 源 |
| `local` | 用户脚本、启动器和图标 |

此步骤不会更改登录 Shell。检查模式会报告 Stow 冲突；比较冲突文件，备份并移开需要替换的版本后再运行部署。Firefox 和用户服务使用下文的独立步骤。

### 开发配置

```bash
./install.sh --check dev
./install.sh dev
```

此步骤部署 `dev/` 中的 `clang-format`、`code`、`git`、`nvim` 和 `scripts`。Code 包提供启动参数，`scripts` 提供开发辅助脚本；Git 配置包含提交身份，使用前按账户调整。

`user` 和 `dev` 均可在步骤名后指定包名，只部署选中的配置：

```bash
./install.sh --check user fish kitty
./install.sh user fish kitty
./install.sh --check dev git nvim
./install.sh dev git nvim
```

部署方式和运行数据的处理见[链接规则](#链接规则)。

### KDE

登录 Plasma 会话后执行：

```bash
./install.sh --check kde
./install.sh kde
```

此步骤先部署 `de-wm/kde/` 中的 Portal、D-Bus 服务和会话脚本，再刷新远端 PKGBUILD，安装 `kde-config`、`chatgpt-translucent-bars` 及其依赖，最后运行 `kde-config` 应用当前用户设置。主题、应用补丁和 Flatpak 微信的配置见[桌面与应用](desktop.md)。

只部署仓库内的 KDE 文件时执行：

```bash
./install.sh --check de-wm kde
./install.sh de-wm kde
```

`de-wm/niri/` 保存 Niri 配置、Noctalia 插件和专用服务。所有安装步骤均排除此目录，不向家目录建立 Niri 链接，详见 [Niri](desktop.md#niri)。

### Firefox

启动 Firefox 一次，在 `about:profiles` 找到要使用的配置目录，选择“根目录”而非“本地目录”，然后关闭 Firefox。将下方占位路径替换为该目录：

```bash
./install.sh --check firefox "/实际的/Firefox/配置根目录"
./install.sh firefox "/实际的/Firefox/配置根目录"
```

目标目录必须已存在且包含 `prefs.js`。首页设置、扩展规则和同步范围见 [Firefox 配置](desktop.md#firefox)。

### 系统配置

先按[机器配置](system.md#机器配置)核对磁盘 UUID、CPU 架构、内核、EFI 路径和硬件参数，再比较和部署：

```bash
./install.sh etc diff
./install.sh --check etc
./install.sh etc
```

此步骤会替换清单中的系统文件。按需部署部分文件、导出实机配置、恢复 AVS 固件和重建 UKI 的方法见[系统配置](system.md)。

### 私密配置

将 Chromium/API 凭据手动迁入 `backup/private/chromium.fish` 后执行：

```bash
./install.sh --check private
./install.sh private
```

脚本将文件复制到 `~/.config/fish/conf.d/chromium.fish`，权限为 `0600`，并替换已有目标文件。Carillon 等其他私密配置需单独恢复，`private` 步骤不会遍历或部署整个 `private/` 目录。

### 用户服务

先恢复服务需要的程序、账户配置和目录，再审阅 `user/systemd/.config/systemd/user/` 中的 target 与 `Wants=`：

```bash
./install.sh --check systemd
./install.sh systemd
```

此步骤部署 unit 和已有的会话依赖链接，并运行 `systemctl --user daemon-reload`，不立即启动服务。target 中未注释的 `Wants=` 决定下次对应会话启动哪些服务。

| target | 启动时机 |
| --- | --- |
| `personal-background.target` | 用户管理器的 `default.target` 启动时 |
| `personal-graphical.target` | 图形会话启动时 |

target 引用的服务可能由外部软件包提供，例如 `foxvault.service` 和 `theme-sync.service`。OneDrive 还需要恢复 rclone 的 `onedrive` 远端，并保证当前用户能写入 `/mnt/network/onedrive` 和 `/mnt/network/cache/onedrive`。`personal-niri.target` 及其服务保存在 `de-wm/niri/`，不由此步骤部署。

修改 target 后重新运行 `./install.sh systemd`。如需在当前图形会话启动已配置的 Carillon，可执行：

```bash
systemctl --user start carillon.service
systemctl --user status carillon.service
```

## 链接规则

所有 Stow 部署统一使用 `--no-folding --restow`。目标目录保留为真实目录，只为具体配置文件建立相对符号链接；已有的 Stow 目录链接会在重新部署时展开。Stow 无法识别的链接或不同的独立文件按冲突处理。

`.local/share/` 及其子目录不得整体链接到仓库。例如 `~/.local/share/applications/` 保留为真实目录，只链接其中受管理的 `.desktop` 文件。系统新增的启动器、图标缓存和应用数据保存在家目录中。已链接文件的内容修改仍会写回仓库，需要独立变化的运行数据不应纳入配置包。

源包中的 `.local/`、`.local/share/` 必须是真实目录，`.local/share/` 内的符号链接只能指向普通文件。安装脚本在部署任何选中包之前检查这些条件，并拒绝目录链接和无效链接，避免源包中的链接绕过 `--no-folding`。检查模式执行同样的校验。

Fish 历史、变量、私密配置和 Neovim 的 `lazy-lock.json` 由安装入口排除，保留在家目录中独立维护。

## 检查模式

| 步骤 | `--check` 的行为 |
| --- | --- |
| `user`、`dev`、`de-wm kde` | 检查包名、部署源目录和符号链接，再模拟对应分组的 Stow 部署 |
| `systemd` | 模拟用户服务部署，并显示重读配置命令 |
| `firefox` | 检查目标目录及 `prefs.js`，再模拟 Stow 部署 |
| `packages` | 查询本机已安装包，列出清单中缺少的包名 |
| `kde` | 模拟本地 KDE 配置部署，再显示安装组件和应用设置的命令 |
| `etc install`、`firmware` | 显示待执行命令 |
| `private` | 检查凭据源文件存在，再显示复制命令 |
| `etc export` | 按实机文件状态显示待执行的复制命令 |

`etc diff` 本身只读，直接显示内容和权限差异。检查模式不会安装软件、验证远端包是否可获得、测试权限认证或确认硬件适用性；`firmware` 的检查模式也不验证源固件是否存在。
