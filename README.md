# dotfiles

本仓库用于在新安装的 Arch Linux 系统上恢复个人工作环境，涵盖 KDE Plasma 6、Niri 和 Umbriel 三种桌面会话。家目录配置通过 GNU Stow 建立相对符号链接，系统配置与软件包通过 [install.sh](install.sh) 和 [scripts/packages.sh](scripts/packages.sh) 分步管理。仓库以已完成磁盘挂载、EFI 引导配置和网络连接的基础 Arch Linux 环境为起点；迁移到新硬件或更换账户时，需先按目标机器调整内核参数、硬件配置及个人路径。

## 基本用法

首次恢复环境时，按[安装指南](docs/install.md)中的顺序在仓库根目录以普通用户身份执行各安装步骤。脚本会在需要系统权限的命令前自动调用 `run0` 完成提权认证，直接运行 `./install.sh` 或传入 `--help` 可查看所有可用步骤：

```bash
./install.sh --help
```

在步骤名前传入 `--check` 参数可进入只读检查模式，用于在真正写入前模拟 Stow 链接、显示待执行的系统命令或核对本机缺失的软件包，各步骤的具体检查行为见[检查模式](docs/install.md#检查模式)。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [安装指南](docs/install.md) | 软件源准备、完整部署顺序、链接校验规则与检查模式 |
| [系统配置](docs/system.md) | `/etc` 配置部署与反向同步、硬件参数核对、AVS 固件及 UKI 维护 |
| [桌面与应用](docs/desktop.md) | KDE 插件与主题、Niri 与 Umbriel 会话、Firefox 样式和 Carillon 邮件通知 |
| [软件包与源码](docs/packages.md) | pacman 包清单同步、安装流程、独立软件恢复与外部源码仓库边界 |
| [拾光日记](docs/diary.md) | 拾光日记软件包的安装、更新、数据备份与上游文档索引 |

## 目录结构

| 路径 | 内容 | 部署入口 |
| --- | --- | --- |
| `dev/` | Git、ClangFormat、Neovim、VS Code 启动参数和开发辅助脚本 | `dev [包…]` |
| `user/` | Fish、Kitty、字体、日常应用、Paru、音频规则和通用用户脚本 | `user [包…]` |
| `user/systemd/` | 个人后台服务、通用图形会话服务与 systemd target | `systemd` |
| `user/firefox/` | Firefox 偏好设置、界面样式和扩展规则文件 | `firefox PROFILE` |
| `de-wm/kde/` | KDE Portal 规则、D-Bus 服务和会话辅助脚本 | `de-wm kde`；含远端组件用 `kde` |
| `de-wm/niri/` | Niri 配置、Portal 规则和 Niri 专用用户服务 | `de-wm niri` |
| `de-wm/umbriel/` | Umbriel 配置、Portal 规则和 XWayland 资源脚本 | `de-wm umbriel` |
| `etc/` | 软件源、Chrome 策略、编译参数、内核引导和硬件规则 | `etc` |
| `packages/` | 按软件源状态和安装原因分类的四份 pacman 包清单 | `packages` |
| `scripts/packages.sh` | pacman 包清单的导出、缺失检查与恢复安装脚本 | 见[软件包与源码](docs/packages.md) |
| `private/` | 手动迁入的私密凭据、KWallet 密钥库与声卡固件 | `private`、`firmware` |

## 部署约定

`dev/`、`user/` 和 `de-wm/` 是 GNU Stow 的分组目录，下一层子目录按应用或会话分包，包内目录结构直接对应用户家目录（`user/firefox/` 对应指定的 Firefox 配置根目录）。脚本调用 Stow 时统一使用 `--no-folding --restow` 参数，保留家目录中的各级真实目录，只为具体配置文件创建指向仓库的相对符号链接，从而允许修改已链接配置时直接写回仓库，同时保证应用在运行时生成的新文件留在本地家目录。为了防止应用数据目录被整体折叠链接到仓库，`.local/` 与 `.local/share/` 必须保持为真实目录，详见[链接规则](docs/install.md#链接规则)。当家目录中已存在内容不同的同名普通文件时，Stow 会报告冲突并中止操作，需先比对差异并移开原文件后再重新部署。桌面环境配置需通过 `de-wm kde`、`de-wm niri` 或 `de-wm umbriel` 显式指定目标会话。

`/etc` 下的系统配置文件根据读取时机和权限隔离要求，分别采用相对符号链接或独立文件副本部署，具体规则见[系统配置](docs/system.md)。`packages/` 仅记录软件包名称与安装原因，恢复环境时直接安装软件源中的当前版本。存放凭据与固件的 `private/` 目录以及外部备份目录排除在 Git 跟踪之外，跨设备恢复时需单独迁入对应目录；Fish 运行历史与通用变量、桌面主题明暗状态以及 Neovim 的 `lazy-lock.json` 锁文件均保留在家目录中由对应程序自行维护。
