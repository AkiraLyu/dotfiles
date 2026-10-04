# dotfiles

用于恢复 Arch Linux 个人工作环境的配置仓库，主要面向 KDE Plasma 6。用户配置通过 GNU Stow 部署，系统配置和软件包由 [install.sh](install.sh) 按步骤管理。

仓库以已安装、可联网的 Arch Linux 为起点。磁盘分区、挂载和 EFI 启动项由系统安装流程准备；硬件参数、账户路径和私密数据需要按目标机器调整。

## 使用

首次恢复环境请按[安装指南](docs/install.md)操作。所有安装步骤相互独立，以普通用户运行；需要系统权限的命令由脚本调用 `run0`。

```bash
./install.sh --help
```

`--check` 必须放在步骤名前。它用于模拟链接、显示待执行命令或检查本机包名，不代表完整的安装验证。各步骤的检查范围见[检查模式](docs/install.md#检查模式)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [安装指南](docs/install.md) | 软件源、部署顺序、可选配置和用户服务 |
| [系统配置](docs/system.md) | `/etc` 比较、部署、导出，以及 UKI 和固件维护 |
| [桌面与应用](docs/desktop.md) | KDE 主题、应用补丁、Firefox 和 Carillon |
| [软件包与源码](docs/packages.md) | 包清单、安装原因和源码维护边界 |
| [拾光日记](docs/diary.md) | 日记应用的使用、存储、开发和打包 |

## 目录

| 路径 | 内容 | 部署入口 |
| --- | --- | --- |
| `fish/` | Shell、提示符、配色和环境变量 | `home` |
| `fontconfig/` | 字体替换、回退和渲染规则 | `home` |
| `chromium/` | Chromium、Chrome、Electron、Code、QQ 等启动参数 | `home` |
| `local/` | 用户脚本、启动器、Paru 配置和拾光日记源码 | `home` |
| `nvim/`、`kitty/`、`tools/` | Neovim、Kitty 和其他工具配置 | [手动选择 Stow 包](docs/install.md#可选配置) |
| `systemd/` | 用户服务及会话 target | `systemd` |
| `firefox/` | 偏好设置、界面样式、首页和扩展规则文件 | `firefox PROFILE` |
| `etc/` | 软件源、Chrome 策略、构建参数、引导和硬件配置 | `etc` |
| `packages/` | 按来源和安装原因分类的包清单 | `packages` |
| `scripts/packages.sh` | 包清单的导出、检查和安装 | 见[软件包与源码](docs/packages.md) |

## 部署约定

Stow 使用逐文件相对链接，保留目标目录。目标已有不同的独立文件时会报告冲突；比较内容并处理冲突后再部署，安装入口不使用 `--adopt` 接管文件。部署后保留仓库路径，修改已链接的配置会影响对应应用。

`/etc` 文件按[系统配置](docs/system.md)中的规则链接或复制。软件包仅记录包名和安装原因，恢复时使用当前软件源版本。

`backup/` 和 `private/` 不进入 Git，需要单独备份和迁移。Fish 历史、运行状态和凭据也不由普通配置部署管理。`dotfile/` 是被排除的旧仓库存档，不参与安装。
