# 复现顺序与操作入口

`install.sh` 管理软件清单、私有备份恢复和 Stow 配置部署，`--plan` 展示本文。可以从 Arch ISO 的基础安装阶段开始，也可以从已有可启动系统直接恢复软件。磁盘操作必须显式选择，详见 [基础安装说明](docs/ARCH_INSTALL.md)。

目标是恢复当前软件和使用习惯。pacman 与 Flatpak 清单记录安装选择，不冻结整套 Arch 或应用版本；Rust 工具链、Cargo 来源和缺失 npm 包使用具体版本。

## 迁出前更新输入

```bash
./install.sh --export pacman rust cargo flatpak noctalia
./install.sh --export codex
./install.sh --export private
# 或一次导出上述全部内容
./install.sh --export all
```

| 输入 | 保存位置 | 内容 |
| --- | --- | --- |
| pacman | `backup/pacman/` | 四类包清单、完整版本、架构/仓库名及 pacman.conf 参考副本 |
| Rust | `packages/rust.json` | 具体工具链版本、默认选择、components、targets |
| Cargo | `packages/cargo.json` | 来源、Git commit 或 registry 版本、toolchain、features、bins、target |
| npm | `packages/npm.json` | 当前两个全局包及版本；按用户要求维持内容，export 不自动改写 |
| Flatpak | `packages/flatpak/` | remote、公钥、应用完整 ref、system/user 范围、用户 overrides |
| Codex | `backup/codex/<时间戳>/` | 私有快照，`latest` 指向最近一次成功导出 |
| 账户与钱包 | `backup/private/<时间戳>/` | rclone.conf、Mirador 配置目录、kwalletd 全目录；独立 `latest` |
| Noctalia v5 | `niri/.config/noctalia/config.toml` | 当前合并用户配置；录屏插件源码另保存在 niri 的数据目录 |
| Qt/Plasma | `qt-plasma/` | 配置、QML 组件和安装脚本 |
| 原生程序源码 | `local/.local/src/` | 十个已有源码目录及统一来源索引；本轮仅集中目录和路径 |

`backup/` 继续不进入 Git，重装时完整手动迁移。可用 `--backup-dir DIR` 指定其他备份根目录；默认是仓库下的 `backup/`。仅部署配置不要求 backup 在场。

## 新机器上的顺序

所有命令以目标普通用户运行；系统安装由入口调用 `run0`。软件操作的 `--bootstrap`、`--export`、`--restore` 必须是第一个参数。

| 顺序 | 操作 | 依赖和完成条件 |
| --- | --- | --- |
| 0 | `--arch-install` / `--arch-mount` / `--arch-post-install` | 可选的 Arch ISO 阶段，显式选择磁盘，默认只读；使用 /efi，按新 UUID 先生成启动输入和触控板修复，再构建 UKI |
| 1 | 准备软件源、仓库和手动迁移的 backup | 按目标 CPU 配置适用的 Arch/CachyOS 源及 keyring。当前快照用了 CachyOS v4 源；不会自动复制源配置或 IgnorePkg |
| 2 | `./install.sh --bootstrap` | 使用已配置的源完整升级，并安装 base-devel、Git、Stow、Python、rustup、npm、Flatpak |
| 3 | `./install.sh --restore pacman rust cargo npm flatpak --check` | 检查全部所选输入、架构、当前数据库中的仓库包及 Flatpak 来源/override 冲突；不提权、不安装 |
| 4 | `./install.sh --restore pacman rust cargo npm flatpak` | 固定顺序：仓库包 → Rust → foreign/个人包 → Cargo → npm → Flatpak |
| 5 | `./install.sh --restore codex private` | 从独立终端恢复私有数据，再启动 Codex、rclone、Mirador 和钱包；Codex 目录必须为空或不存在，private 允许相同数据，拒绝不同数据 |
| 6 | `./install.sh --check`，随后按需部署配置包 | 默认九个用户包；Qt 原生扩展按 qt-plasma 的 README 构建安装，再生成主题资源 |
| 7 | 单独处理 `etc`、`firefox` | 新系统 UUID 由后置阶段生成，勿强行覆盖；仓库 sound.conf 已与实际一致。Firefox 建立 profile 并登录 Sync，再部署样式和设置 |
| 8 | `./install.sh --user-targets --check`，随后 `./install.sh --user-targets` | 校验并部署用户 unit/启用链接，修复同源绝对链接，自动执行用户 daemon-reload；不启停应用 |
| 9 | KDE/Niri 会话验收 | 检查主题、插件、录屏、挂载及服务；启动链有变化时，正确生成 UKI 后进行重启验证 |

`--restore pacman` 包含 Rust 初始化，确保 AUR/个人包构建前已有工具链；`--restore cargo` 也先恢复 Rust。其他阶段可单独运行，例如 `./install.sh --restore flatpak --check`。

`--restore all` 选择全部软件、Codex 和 private 数据阶段，任何输入错误都会在安装前阻止执行。当前正在使用的 `.codex` 非空，或其他私有配置与备份不同时会停止；在当前机器检查软件请使用上表的显式阶段列表。

## 管理器的恢复规则

### pacman 与个人包

| 文件 | 导出条件 | 当前数量 |
| --- | --- | ---: |
| `pkglist.txt` | `-Qqen`：仓库包，显式安装 | 193 |
| `pkglist_aur.txt` | `-Qqem`：foreign 包，显式安装 | 57 |
| `pkglist_deps.txt` | `-Qqdn`：仓库包，仅作为依赖 | 1570 |
| `pkglist_aur_deps.txt` | `-Qqdm`：foreign 包，仅作为依赖 | 15 |

合计 1835 个包，覆盖手动标成依赖的可选功能。恢复用 `--needed`，最后用 `pacman -D --asdeps/--asexplicit` 恢复安装原因；不会卸载目标机器额外的包。

foreign 不等于 AUR：paru 同时读取 `tools/.config/paru/paru.conf` 中的个人 PKGBUILD 源，无需提前部署 tools。当前仓库包清单包含 paru；更换软件源后须先使清单包在目标机器可用，缺包预检就会停止。

`versions.txt`、`pacman.conf.reference` 用于核对，不按旧版本降级或启用旧 IgnorePkg。新机器不适用的 CPU/硬件包仍需调整。niri-meta 的同版本依赖漂移仍待修正，包名导出不能代替固定构建来源。

### Rust、Cargo 与 npm

Rust 保存 1.96.0、nightly-2026-06-28、1.88.0 三套 x86_64 工具链和实际 components/targets，默认固定日期的 nightly。迁出机的 stable/nightly 别名在恢复时转为具体版本；本轮未更改当前 Rust 默认值。以后升级应先验证再导出。

Cargo 仅保留 Mirador，固定到 `2b50652eb23f826d647b399d942df73c48691f2e`，以 `--locked` 构建到 `~/.cargo`。`mirador.service` 已指向 `%h/.cargo/bin/mirador`；账户配置和钱包通过 `--restore private` 恢复。niri-shot 已卸载，不进入清单。导出遇到其他 path 安装会报错，要求先保存可恢复的源码来源。

npm 全局 prefix 设置为 `~/.local`。现有包版本保留，仅补装缺失项；当前为 `@bitkyc08/opencodex@2.42.0` 和 `@deepseek-ai/dsh@0.1.0-rc.6`。工具的账户/代理私有配置不在软件清单中。

### Flatpak

保存 WeChat、GNOME Network Displays、LibreOffice 三个 system 应用的分支/架构、Flathub URL 和签名公钥，runtime 由 Flatpak 安装。相同已装 ref 跳过，不执行应用升级。同名 remote 指向不同 URL，或目标已有不同 override 时停止。

八份用户 override 包括微信缩放及历史浏览器的 Plasma 集成权限；保留 override 不会安装对应浏览器。应用私有数据 `~/.var/app` 不在清单中。

### Codex 私有备份

读取 `CODEX_HOME`，未设置时为 `~/.codex`。保存配置、认证、插件、skills、会话和数据库；跳过进程锁、socket、临时执行目录及 SQLite journal/WAL。每个 SQLite 使用 backup API 合并已提交内容并校验，生成独立数据库。备份目录为 700、清单为 600，逐文件记录 SHA256。默认目录定义见[官方环境变量文档](https://learn.chatgpt.com/docs/config-file/environment-variables)。

整份快照成功后才更新 `latest`。恢复先校验所有文件，再复制到临时目录并改名；不覆盖非空 `.codex`。可在临时 home 演练：

```bash
restore_test_dir=$(mktemp -d)
./install.sh --restore codex --target "$restore_test_dir"
```

演练目录含私有认证和历史，检查后自行移除。当前已对 4789 个文件/链接、10 个 SQLite 做过真实复制、校验和读取验证。

快照保证单个数据库一致，运行中的多文件状态没有统一事务。迁出前尽量退出 Codex，再从终端导出。历史项目路径和外部目录引用保留原值，更换用户名/路径时须核对；外置数据库与工作区不因复制 `.codex` 自动迁移。

### rclone、Mirador 与 KWallet 私有备份

`./install.sh --export private` 保存当前用户的 `.config/rclone/rclone.conf`、整个 `.config/mirador/` 和 `.local/share/kwalletd/`，包括钱包的 `.kwl`、`.salt` 与属性文件。数据保持原格式，不解密、不输出账户内容；私有快照的目录权限统一为 700，文件为 600。备份文件本身没有额外加密，迁移时应保留这些权限。

仅在全部文件复制前后保持一致时发布快照；否则重试并最终报错，保留上一份 `latest`。迁出前最好退出相关程序，保证内存中的更改已经落盘。恢复前校验 SHA256 和路径，全部目标通过预检才写入；相同数据跳过，不覆盖不同配置或钱包，也不合并钱包内容。先恢复再登录桌面或启动相关应用，钱包解锁仍使用原有密码。

```bash
./install.sh --restore private --check
./install.sh --restore private
# 同样支持 --backup-dir DIR，以及 --target 临时目录进行恢复演练
```

## 配置部署与应用边界

```bash
./install.sh --check                       # 默认九个用户包
./install.sh --check --all                 # 全部配置目标，只读
./install.sh fish kitty qt-plasma niri      # 仅部署选中包
./install.sh firefox --firefox-profile /path/to/profile
```

默认顺序为 fontconfig、fish、kitty、chromium、tools、qt-plasma、local、nvim、niri；显式选中的 etc、firefox、systemd 排在后面。`--all` 表示全部配置包，与 `--restore all` 不同。

全部目标先统一模拟 Stow，home 与 systemd 合并检查，etc/Firefox 分别检查。冲突或 profile 歧义会阻止部署。新链接用 `--no-folding`，不使用 `--adopt` / `--override`；执行中失败会停止后续步骤，已完成链接没有自动回滚。

- Neovim 仅部署已有配置，不执行 Lazy/Mason 同步、不处理插件源码或锁文件。
- VS Code 使用 GitHub Settings Sync，不额外管理配置和扩展。
- Firefox 使用自动同步，扩展不做清单或安装；仓库仍管理 CSS/user.js。
- Noctalia v4 的 JSON/QML 和旧 Quickshell 源码树已清除，v5 TOML、录屏 Luau 插件和 IPC 按键已保存。插件位于 `niri/.local/share/noctalia/plugins/screen_recorder`，与官方 commit `52f6ef9f47f51aae72bdea743aed80abd525b943` 的 13 个文件逐一一致。该目录会作为本地插件来源自动发现，见[官方插件说明](https://docs.noctalia.dev/noctalia/plugins/)。

Noctalia GUI 设置保存在 `~/.local/state/noctalia/settings.toml`，优先于仓库配置。GUI 修改后用 `--export noctalia` 保存；这个命令只导出设置，不刷新录屏源码快照。当前配置有 7 条既有警告：未启用的 bongocat/notes/wallhaven 组件、notes 设置和 cpu/ram/temp 的 `show_label`，配置及录屏 lint 均成功。照片/壁纸路径及锁屏输出仍是主机参数。运行数据和认证不放进公开配置，见[配置层说明](https://docs.noctalia.dev/noctalia/configuration/)。

## 尚需完成的整机工作

原生程序源码已统一到 [local/.local/src/](local/.local/src/README.md)，Qt/Plasma 配置与安装入口仍在 `qt-plasma`；本轮未构建或制包。Kate、App Grid、微信 KWin 插件的原生库仍不是 pacman 包，已有构建说明见 [qt-plasma/README.md](qt-plasma/README.md)。UUID/声卡、EFI 挂载和 UKI 顺序已处理，钱包与挂载账户已纳入 private。其他散装 ELF 与实际重装验收仍需整理；后续对 Niri 的改动仅涉及本次指定删除的 Pot 引用，EDID 保持原状。

当前全量 Stow 预检仍报告已有独立文件和手工链接冲突，不能自动覆盖硬件配置。`--check` 通过也不代表真实下载、构建、服务启动和整机复现完成。

测试使用真实 Stow、临时仓库/home、命令替身及真实 SQLite WAL：

```bash
python3 -B -m unittest discover -s tests -v
```

安装/恢复测试覆盖临时 home、命令替身、真实 Stow/SQLite，以及私有数据的完整性、权限和冲突保护。2026-09-06 复查中 52 项测试、源码摘要、临时恢复和 Niri/Noctalia 检查通过；当前全量 Stow 仍有 10 处冲突，foreign 包来源和完整桌面恢复仍有缺口。统一审查结果保留在 `.codex/audits/2026-09-05/review.md`，其余审查中间记录已清理。

此前用户 unit 链接已规范化，但后续 Mirador 参数修改仍待用户管理器重新加载及服务验收。2026-09-06 的复查未执行包升级、UKI 重建、构建安装、配置部署或服务重载/重启。
