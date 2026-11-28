# 软件包与源码

[返回 README](../README.md)

[scripts/packages.sh](../scripts/packages.sh) 负责导出、检查和恢复系统中的 pacman 软件包名称与安装原因。清单按软件包的当前软件源状态和安装原因分类记录，恢复环境时直接安装软件源提供的当前版本；执行恢复前需先按[安装指南](install.md#准备环境)配置好软件源与签名密钥环。

## 包清单

`packages/` 目录下的四份纯文本清单每行记录一个包名，按导出时软件包是否存在于已启用软件源（native 与 foreign）以及安装原因（显式安装与作为依赖安装）划分为四个集合：

| 文件 | 软件源状态 | 安装原因 |
| --- | --- | --- |
| [repo.txt](../packages/repo.txt) | 存在于当前启用的软件源 | 用户显式安装（`-Qe -Qn`） |
| [repo-deps.txt](../packages/repo-deps.txt) | 存在于当前启用的软件源 | 作为依赖安装（`-Qd -Qn`） |
| [foreign.txt](../packages/foreign.txt) | 不在当前启用的软件源中 | 用户显式安装（`-Qe -Qm`） |
| [foreign-deps.txt](../packages/foreign-deps.txt) | 不在当前启用的软件源中 | 作为依赖安装（`-Qd -Qm`） |

`foreign` 清单涵盖 AUR 软件包、来自 [AkiraLyu/pkgbuilds](https://github.com/AkiraLyu/pkgbuilds) 的自有配方包以及本地手动构建安装的包。当系统启用或移除第三方软件源（如 `archlinuxcn` 或 `cachyos`）后，同一软件包在 `repo` 与 `foreign` 之间的归类会随之改变。

## 导出与检查

在日常安装、卸载或替换软件后，从仓库根目录运行 `export` 子命令即可将本机当前的软件包状态同步回四份清单：

```bash
./scripts/packages.sh export
git diff -- packages/
```

导出脚本会校验四份清单合并后的结果是否与 `pacman -Qq` 的完整列表严格一致，校验通过后才算导出成功；提交前通过 `git diff` 审阅变更，确保临时测试安装的软件已清理完毕。日常核对本机已安装包与清单是否存在缺失或未导出的新增差异时，可运行只读检查命令：

```bash
./install.sh --check packages
```

## 安装流程

运行 `./install.sh packages` 会调用 `./scripts/packages.sh install`，按以下三个阶段恢复软件包环境：

1. 调用 `run0 pacman -Syu --needed` 完整升级系统并安装 `repo.txt` 中的显式包，随后以 `--needed --asdeps` 补齐 `repo-deps.txt` 中的依赖包。
2. 指定仓库内的 [Paru 配置](../user/paru/.config/paru/paru.conf)运行 `paru --sudo run0 -Sy --pkgbuilds` 刷新远端自有 PKGBUILD 仓库，再统一构建并安装 `foreign.txt` 与 `foreign-deps.txt` 中的所有软件包。
3. 调用 `run0 pacman -D` 将 `repo.txt` 与 `foreign.txt` 中的包标记为 `--asexplicit`，将 `repo-deps.txt` 与 `foreign-deps.txt` 中的包标记为 `--asdeps`，从而修正因 `--needed` 跳过已安装包而遗留的旧安装原因。

若清单中的某个 AUR 包或自有配方包已改名、下架，先在清单中更新包名或在 `pkgbuilds` 仓库中补齐配方，再重新运行安装步骤。

## 独立安装项

pacman 包清单之外的工具链与语言包管理器程序需在软件包恢复后单独配置。`repo.txt` 已包含 `rustup`，安装完成后运行以下命令初始化默认工具链：

```bash
rustup default nightly
```

微信通过 AUR 软件包 `wechat` 与 `wechat-bin` 维护在 `foreign` 包清单中，随 `./install.sh packages` 一同安装，毛玻璃插件配置见[桌面与应用](desktop.md#应用补丁)。通过 Cargo 安装的 Carillon 邮件监听程序按[桌面与应用](desktop.md#carillon)中的说明恢复，Firefox 与 Chrome 的账户、书签及扩展数据通过浏览器同步功能或独立备份恢复。

## 源码与配方

本仓库专注于维护个人配置文件与辅助脚本，个人开发的应用源码、桌面插件与打包配方按职责拆分在各自的独立仓库中维护：

| 内容 | 维护位置 |
| --- | --- |
| 家目录配置、`/etc` 配置与日常脚本 | 本仓库 |
| 拾光日记应用源码与项目文档 | [AkiraLyu/shiguang-diary](https://github.com/AkiraLyu/shiguang-diary) |
| KDE 插件、Darkly 主题、应用补丁与 `kde-config` | [AkiraLyu/kde-plugins](https://github.com/AkiraLyu/kde-plugins) |
| 个人元包、定制组件与应用的 Arch PKGBUILD 配方 | [AkiraLyu/pkgbuilds](https://github.com/AkiraLyu/pkgbuilds) |
| Noctalia 分支、Gamescope、WPS 解帧与知乎导出器源码 | `pkgbuilds` 对应配方声明的上游仓库 |

更新 `AkiraLyu/pkgbuilds` 中的任何配方后，需同步运行 `makepkg --printsrcinfo > .SRCINFO` 并提交推送，以便 Paru 在刷新 `--pkgbuilds` 时正确解析包版本与依赖关系。Niri 与 Umbriel 的会话配置分别通过 `de-wm niri` 与 `de-wm umbriel` 部署，拾光日记的安装与维护说明见[拾光日记](diary.md)。
