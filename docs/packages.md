# 软件包与源码

[返回 README](../README.md)

[scripts/packages.sh](../scripts/packages.sh) 管理 pacman 包名和安装原因。清单随环境更新，不锁定版本；恢复前按[安装指南](install.md#准备环境)准备软件源和密钥环。

## 包清单

四份清单每行一个包名，按导出时的软件源状态和安装原因分类：

| 文件 | 来源 | 安装原因 |
| --- | --- | --- |
| [repo.txt](../packages/repo.txt) | 当前软件源中存在 | 显式安装 |
| [repo-deps.txt](../packages/repo-deps.txt) | 当前软件源中存在 | 作为依赖安装 |
| [foreign.txt](../packages/foreign.txt) | 当前软件源中不存在 | 显式安装 |
| [foreign-deps.txt](../packages/foreign-deps.txt) | 当前软件源中不存在 | 作为依赖安装 |

`foreign` 不等同于 AUR 包，也可能是自有配方或其他手动安装的包。软件源变化后，同一包的分类也可能改变。

## 导出与检查

调整软件组合后，在仓库根目录执行：

```bash
./scripts/packages.sh export
git diff -- packages/
```

导出会覆盖四份清单，并校验其合并结果是否与本机已安装包一致。提交前检查差异，避免把仅供临时使用的软件纳入恢复清单。

```bash
./install.sh --check packages
```

检查只比较本机已安装包名，不检查版本、安装原因或远端包是否仍可获得。缺少的包会列在输出中。

## 安装流程

`./install.sh packages` 调用包管理脚本，依次执行：

1. 通过 `pacman -Syu --needed` 升级并安装软件源中的显式包，再补齐依赖包。
2. 使用仓库的 [Paru 配置](../user/paru/.config/paru/paru.conf)刷新远端 PKGBUILD，再安装 `foreign` 包。
3. 使用 `pacman -D` 恢复显式安装和依赖安装的标记，包括被 `--needed` 跳过的已有包。

Paru 从 [AkiraLyu/pkgbuilds](https://github.com/AkiraLyu/pkgbuilds) 和 AUR 查找配方。清单中的包改名、删除或尚未发布时，需要先调整清单或恢复配方，再继续安装。

## 独立安装项

pacman 清单不包含 Rust 工具链、Cargo 安装的程序、Flatpak 应用和应用账户数据。

包清单包含 `rustup`，nightly 工具链需单独设置：

```bash
rustup default nightly
```

Flatpak 微信和 Cargo 安装的 Carillon 见[桌面与应用](desktop.md)，浏览器账户、扩展及书签通过浏览器同步功能或备份恢复。

## 源码与配方

| 内容 | 维护位置 |
| --- | --- |
| 配置和用户脚本 | 本仓库 |
| 拾光日记源码和应用文档 | [AkiraLyu/shiguang-diary](https://github.com/AkiraLyu/shiguang-diary) |
| KDE 插件、主题、应用补丁和 KDE 设置 | [AkiraLyu/kde-plugins](https://github.com/AkiraLyu/kde-plugins) |
| 自有元包及应用 PKGBUILD | [AkiraLyu/pkgbuilds](https://github.com/AkiraLyu/pkgbuilds) |
| Gamescope、WPS FPS Unlock 和知乎导出器源码 | 对应配方声明的上游仓库 |

应用源码和软件包配方由对应项目维护，本仓库不保存本地 PKGBUILD。`de-wm/niri/` 保留的 Noctalia 录屏插件是 Niri 配置存档的一部分，不参与当前环境的安装。修改远端配方时同步生成 `.SRCINFO`，供 Paru 读取包信息。拾光日记通过 `pkgbuilds` 中的配方安装，操作见[拾光日记](diary.md)。

应用数据、日记库和导出文件需要单独备份，不属于源码或软件包清单。
