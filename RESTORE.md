# 复现顺序

入口统一为 `install.sh`，`--plan` 显示本文。除 Arch ISO 阶段外，以目标普通用户运行，系统写入由入口调用 `run0`。`--bootstrap`、`--export`、`--restore` 必须放在第一个参数。

## 迁出前

退出会改写配置的程序后导出，再完整迁移仓库与被 Git 忽略的 `backup/`：

```bash
./install.sh --export all
```

| 输入 | 保存位置 | 恢复内容 |
| --- | --- | --- |
| pacman | `backup/pacman/` | 仓库/foreign × 显式/依赖四类清单；版本快照仅供参考，实际源和编译设置在 `etc/` |
| Rust / Cargo | `packages/rust.json`、`cargo.json` | 固定工具链、组件、目标及 Cargo 来源/版本/构建选项 |
| npm | `packages/npm.json` | 家目录 prefix、OpenCodex（ocx）与 dsh；export 不改写此清单 |
| Flatpak | `packages/flatpak/` | 应用 ref、remote、公钥、安装范围和用户 overrides |
| Codex | `backup/codex/` | 配置、认证、插件、skills、会话与数据库 |
| 账户与钱包 | `backup/private/` | rclone.conf、Mirador 配置目录、KWallet |
| Noctalia v5 | `niri/.config/noctalia/config.toml` | 合并用户设置；录屏插件源码另外随仓库保存 |
| KDE | `qt-plasma/state/`、`templates/` | 桌面设置、mode/preset、Darkly 主题和 Kate 静态入口，恢复为独立文件 |
| AVS 固件 | `backup/firmware/` | 捕获的固件；路径和摘要在 `hardware/avs-firmware.json` |

可只导出某项，如 `./install.sh --export pacman kde`。个人文档、日记库和其他未列入的应用数据仍须另行迁移，见 [review.md](review.md)。

配置直接重写 `backup/codex/`、`backup/private/` 和 `qt-plasma/state/`，不保留旧副本，不重试或回滚。

## 新机器执行顺序

1. 准备可启动的系统；从 ISO 开始时按 [基础安装说明](docs/ARCH_INSTALL.md) 执行。磁盘阶段只在显式选择后运行。
2. 放入仓库及 backup，准备软件源和 keyring。`etc/pacman.conf`、镜像列表和 makepkg 配置已保存当前 CachyOS v4 设置；ISO 后置阶段会写入目标系统。在已安装系统上用 `./install.sh etc` 部署，相同内容跳过，有差异则停止。换用不支持 x86-64-v4 的 CPU 时先调整这些文件。
3. 安装基础工具，再恢复软件：

   ```bash
   ./install.sh --bootstrap
   ./install.sh --restore firmware pacman cargo npm flatpak --check
   ./install.sh --restore firmware pacman cargo npm flatpak
   ```

   固定顺序：固件 → 仓库包 → Rust → 本地 PKGBUILD → KDE 原生包 → 拾光日记 → 其他 foreign 包 → Cargo → npm → Flatpak。`pacman` 已包含 Rust 和三个本地构建阶段。npm 阶段将 `@bitkyc08/opencodex` 安装到 `~/.local`，提供 `ocx` 命令，已有版本保留。

4. 在首次登录桌面、启动 Codex、挂载、Mirador 或钱包之前恢复数据：

   ```bash
   ./install.sh --restore codex private kde --check
   ./install.sh --restore codex private kde
   ```

5. 检查并部署用户配置：

   ```bash
   ./install.sh --check
   ./install.sh
   ./install.sh etc --check
   ./install.sh etc
   ./install.sh firefox --firefox-profile /path/to/profile
   ```

   默认包为 fontconfig、fish、kitty、chromium、tools、qt-plasma、local、nvim、niri；也可显式列出所需包。Firefox 需先创建 profile。`etc` 使用独立副本，保留新系统生成的磁盘 UUID；不会覆盖不同的本机配置。

6. 准备 [rclone 挂载目录](docs/APPLICATIONS.md)，再部署用户服务：

   ```bash
   ./install.sh --user-targets --check
   ./install.sh --user-targets
   ```

   该阶段部署仓库保存的 `ocx.service` 等 unit、建立启用链接并执行用户 daemon-reload，不启动服务；ocx 随 `personal-graphical.target` 启动。系统服务的启用状态由用户另行处理。

7. 登录并验证桌面、音频、触控板、录屏、挂载和相关服务。修改启动输入后还需重建 UKI 并重启验证。

## 恢复规则

- `--all` 选择全部配置包，包括 etc、firefox、systemd；`--restore all` 选择全部软件和数据。正在使用的 `.codex` 非空，因此在本机检查软件时应使用上面的显式阶段列表。
- 所选阶段全部通过预检才执行写入。`--check` 不下载、不构建、不启动服务，也不能证明整机重装成功。执行中失败会停止，已经完成的步骤不自动回滚。
- pacman 清单不冻结 Arch 版本；先补齐仓库包，再处理本地和 foreign 包，最后恢复显式/依赖标记。软件源缺包会停止。替换、延期与更新方式见 [packages/README.md](packages/README.md)。
- npm prefix 为 `~/.local`，现有版本保留，只补装缺失项。Flatpak 同样保留已装 ref，runtime 由管理器解决；`~/.var/app` 数据另行迁移。
- Codex 从 `CODEX_HOME`（默认 `~/.codex`）导出，恢复到目标 `.codex`；目标必须为空或不存在。SQLite 使用 backup API 保存已提交内容，跳过锁和临时文件。不同数据库之间没有统一事务，迁出前应退出应用；外置数据库和工作区不随快照迁移。
- private 快照保持原格式，目录权限 700、文件 600，备份本身没有额外加密。恢复校验内容，相同数据跳过，不同数据停止；钱包仍需原密码。迁出前关闭相关程序再导出。
- 用户配置由 Stow 部署，冲突不会被接管。KDE 使用独立运行副本，修改后用 `--export kde` 更新快照；Noctalia GUI 设置优先于仓库配置，修改后用 `--export noctalia` 保存。
- Neovim 只部署配置；VS Code 和 Firefox 扩展使用各自同步。字体、搜狗词库、EDID 文件以及系统服务按约定不自动恢复。

软件阶段可独立执行：`--restore pkgbuilds`、`--restore kde-plugins`、`--restore diary`；`--restore cargo` 自动先恢复 Rust。`--backup-dir DIR` 可指定备份目录。Codex、private、KDE 支持 `--target DIR` 在空的临时 home 演练，演练副本含私有数据，用后自行清除。
