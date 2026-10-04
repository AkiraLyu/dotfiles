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

已有仓库时直接进入其根目录。默认路径为 `~/dotfiles`；换用其他路径前，检查 Firefox 首页、启动器和脚本中的绝对路径。

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
./install.sh --check home
./install.sh home
```

此步骤只部署 `fish`、`fontconfig`、`chromium` 和 `local`，不会更改登录 Shell。检查模式会报告 Stow 冲突；比较冲突文件，备份并移开需要替换的版本后再运行部署。

### KDE

登录 Plasma 会话后执行：

```bash
./install.sh --check kde
./install.sh kde
```

此步骤刷新远端 PKGBUILD，安装 `kde-config`、`chatgpt-translucent-bars` 及其依赖，再运行 `kde-config` 应用当前用户设置。主题、应用补丁和 Flatpak 微信的配置见[桌面与应用](desktop.md)。

### Firefox

启动 Firefox 一次，在 `about:profiles` 找到要使用的配置目录，选择“根目录”而非“本地目录”，然后关闭 Firefox。将下方占位路径替换为该目录：

```bash
./install.sh --check firefox "/实际的/Firefox/配置根目录"
./install.sh firefox "/实际的/Firefox/配置根目录"
```

目标目录必须已存在且包含 `prefs.js`。首页路径、扩展规则和同步范围见 [Firefox 配置](desktop.md#firefox)。

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

先恢复服务需要的程序、账户配置和目录，再审阅 `systemd/.config/systemd/user/` 中的 target 与 `Wants=`：

```bash
./install.sh --check systemd
./install.sh systemd
```

此步骤部署 unit 和已有的会话依赖链接，并运行 `systemctl --user daemon-reload`，不立即启动服务。target 中未注释的 `Wants=` 决定下次对应会话启动哪些服务。

| target | 启动时机 |
| --- | --- |
| `personal-background.target` | 用户管理器的 `default.target` 启动时 |
| `personal-graphical.target` | 图形会话启动时 |
| `personal-niri.target` | Niri 服务启动时 |

target 引用的服务可能由外部软件包提供，例如 `foxvault.service` 和 `theme-sync.service`。OneDrive 还需要恢复 rclone 的 `onedrive` 远端，并保证当前用户能写入 `/mnt/network/onedrive` 和 `/mnt/network/cache/onedrive`。

修改 target 后重新运行 `./install.sh systemd`。如需在当前图形会话启动已配置的 Carillon，可执行：

```bash
systemctl --user start carillon.service
systemctl --user status carillon.service
```

## 可选配置

`nvim`、`kitty` 和 `tools` 未列入 `home` 步骤。审阅配置后，保留命令末尾需要的包名，再模拟和部署：

```bash
stow --dir="$PWD" --target="$HOME" --no-folding --restow --simulate nvim kitty tools
stow --dir="$PWD" --target="$HOME" --no-folding --restow nvim kitty tools
```

## 检查模式

| 步骤 | `--check` 的行为 |
| --- | --- |
| `home`、`systemd` | 模拟 Stow 部署；`systemd` 额外显示重读配置命令 |
| `firefox` | 检查目标目录及 `prefs.js`，再模拟 Stow 部署 |
| `packages` | 查询本机已安装包，列出清单中缺少的包名 |
| `kde`、`etc install`、`firmware` | 显示待执行命令 |
| `private` | 检查凭据源文件存在，再显示复制命令 |
| `etc export` | 按实机文件状态显示待执行的复制命令 |

`etc diff` 本身只读，直接显示内容和权限差异。检查模式不会安装软件、验证远端包是否可获得、测试权限认证或确认硬件适用性；`firmware` 的检查模式也不验证源固件是否存在。
