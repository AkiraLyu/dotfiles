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
| [拾光日记](docs/diary.md) | 软件包安装、更新和独立项目文档 |

## 目录

| 路径 | 内容 | 部署入口 |
| --- | --- | --- |
| `dev/` | Git、ClangFormat、Neovim、Code 启动参数和开发脚本 | `dev [包…]` |
| `user/` | Shell、终端、字体、日常应用、Paru 和通用用户脚本 | `user [包…]` |
| `user/systemd/` | 后台服务和通用图形会话 target | `systemd` |
| `user/firefox/` | Firefox 偏好设置、界面样式和扩展规则文件 | `firefox PROFILE` |
| `de-wm/kde/` | KDE Portal、D-Bus 服务和会话脚本 | `de-wm kde`；完整安装用 `kde` |
| `de-wm/niri/` | Niri、Noctalia、Portal 和 Niri 专用用户服务 | 仅保留，不链接到家目录 |
| `etc/` | 软件源、Chrome 策略、构建参数、引导和硬件配置 | `etc` |
| `packages/` | 按来源和安装原因分类的包清单 | `packages` |
| `scripts/packages.sh` | 包清单的导出、检查和安装 | 见[软件包与源码](docs/packages.md) |

## 部署约定

`dev/`、`user/` 和 `de-wm/` 是 Stow 包的分组目录，下一层按应用或用途分包。每个包内的路径对应家目录；Firefox 包内的路径对应指定的浏览器配置目录。新增配置时归入对应分组，并在安装脚本中明确登记部署范围。

Stow 使用逐文件相对链接，保留目标目录。`.local/share/` 的目录不得整体链接到仓库，具体限制见[链接规则](docs/install.md#链接规则)。目标已有不同的独立文件时会报告冲突；比较内容并处理冲突后再部署，安装入口不使用 `--adopt` 接管文件。部署后保留仓库路径，修改已链接的配置会影响对应应用。安装脚本不自动遍历分组目录，`de-wm/niri/` 不参与部署。

`/etc` 文件按[系统配置](docs/system.md)中的规则链接或复制。软件包仅记录包名和安装原因，恢复时使用当前软件源版本。

`backup/` 和 `private/` 不进入 Git，需要单独备份和迁移。Fish 历史、运行状态、凭据和 Neovim 插件锁文件保存在家目录，不由普通配置部署管理。`dotfile/` 是被排除的旧仓库存档，不参与安装。
