# 系统配置

[返回 README](../README.md)

`/etc` 下的系统配置文件统一登记在 [install.sh](../install.sh) 的 `system_files` 数组中，`etc` 步骤的部署、差异比较和实机导出均共用这份清单。新增受管系统配置时，将文件按 `/etc` 下的相对路径放入仓库 `etc/` 目录，并在 `system_files` 数组中添加对应条目，脚本在复制文件时会直接沿用仓库源文件的权限位。

## 部署方式

| `/etc` 下的相对路径 | 部署方式 | 用途 |
| --- | --- | --- |
| `environment` | 相对链接 | 全局登录环境变量与输入法参数 |
| `makepkg.conf.d/90-local.conf` | 相对链接 | 本机指令集架构与构建并行参数 |
| `pacman.conf` | 独立副本 | 软件源、并行下载与忽略包设置 |
| `opt/chrome/policies/managed/webrtc.json` | 独立副本 | Chrome WebRTC UDP 泄露防护策略 |
| `tlp.conf` | 独立副本 | TLP 电源管理参数 |
| `security/limits.d/90-memlock.conf` | 独立副本 | PAM 内存锁定上限配置 |
| `modprobe.d/sound.conf` | 独立副本 | Intel 声卡与无线网卡内核模块参数 |
| `cmdline.d/root.conf` | 独立副本 | 内核命令行根分区、休眠与启动参数 |
| `mkinitcpio.conf` | 独立副本 | initramfs 模块与钩子构建配置 |
| `mkinitcpio.d/linux.preset` | 独立副本 | `linux` 内核与 UKI 镜像输出路径 |
| `initcpio/install/block` | 独立副本 | 定制的 mkinitcpio `block` 构建钩子 |
| `udev/hwdb.d/90-swap-caps-esc.hwdb` | 独立副本 | 内置键盘与指定外接键盘的 Caps Lock 与 Esc 互换规则 |
| `conf.d/snapper` | 独立副本 | Snapper 启用的配置清单（`root` 与 `home`） |
| `snapper/configs/root` | 独立副本（`0640`） | 根分区 Btrfs 快照配额与定时保留策略 |
| `snapper/configs/home` | 独立副本（`0640`） | 家目录 Btrfs 快照配额与定时保留策略 |
| `systemd/system/snapper-timeline.timer.d/10-daily.conf` | 独立副本 | 将 Snapper 定时快照周期设为每日执行并启用补跑 |

各配置文件的部署方式由其读取时机和服务隔离要求决定。`environment` 与 `makepkg.conf.d/90-local.conf` 在用户会话登录或执行软件包构建时读取，此时用户家目录已经挂载，采用相对符号链接可使仓库内的修改即时生效。内核引导、包管理器、PAM 认证、内核模块、Snapper 快照、系统单元覆盖片段和早期 udev 规则需要在系统启动早期或脱离用户家目录的环境中稳定读取，而 TLP 电源服务开启了 `ProtectHome=yes` 沙箱隔离无法访问 `/home`，因此这些文件均通过 `install -D` 复制为 `/etc` 下的独立文件，修改仓库文件后重新运行 `etc install` 即可更新。其中 Chrome 策略文件将 `WebRtcIPHandling` 设为 `disable_non_proxied_udp`，部署后可在 Chrome 的 `chrome://policy` 页面点击重新加载以验证生效状态；`snapper/configs/*` 在部署时固定以 `0640` 权限写入，避免 Git 检出后因权限放宽而与实机不一致；部署 `90-swap-caps-esc.hwdb` 时脚本会自动追加执行 `systemd-hwdb update` 更新硬件数据库，部署 `systemd/system/` 下的覆盖单元后脚本会自动追加执行 `systemctl daemon-reload` 重载系统服务配置。

## 比较与同步

在仓库根目录下运行 `./install.sh etc` 可执行比较、部署与反向导出操作。命令末尾可省略文件参数以处理 `system_files` 中的全部条目，也可指定一个或多个 `/etc` 下的相对路径仅处理选中文件：

```bash
./install.sh etc diff
./install.sh --check etc install pacman.conf
./install.sh etc install pacman.conf
./install.sh --check etc export pacman.conf
./install.sh etc export pacman.conf
```

| 操作 | 方向 | 行为 |
| --- | --- | --- |
| `diff` | 比较仓库与实机 | 输出内容与文件权限差异，已链接到仓库、实机未部署或需要 root 权限读取的文件会给出状态提示 |
| `install` | 仓库 → `/etc` | 按预设方式建立相对链接或以目标权限复制为独立文件 |
| `export` | `/etc` → 仓库 | 将实机独立文件的内容写回仓库，普通文件以当前用户直接复制，受限文件通过 `run0` 读取并保持当前用户归属 |

由于 `install` 与 `export` 会直接覆盖目标文件，执行同步前应先运行 `etc diff` 检查差异。对于仅允许 root 读取的配置文件（如 `0640` 权限的 `snapper/configs/*`），`etc diff` 保持只读且不触发提权，需要核对内容差异时可直接运行 `run0 diff -u etc/snapper/configs/root /etc/snapper/configs/root`；执行 `etc export` 时，脚本会自动跳过已链接到仓库同一文件的条目以及实机尚未部署的路径，并在写回仓库时保持当前用户归属与普通文件权限。

## 机器配置

将仓库迁移到新设备或更换硬件前，需先逐项核对并调整以下与机器强相关的配置项：

| 文件 | 核对项 |
| --- | --- |
| `pacman.conf` | 软件源、密钥环、镜像列表、`cachyos-v4` 架构匹配及 `IgnorePkg`（当前忽略 `dolphin`、`pacman` 与 `dae-git`），详见[安装指南](install.md#准备环境) |
| `makepkg.conf.d/90-local.conf` | CPU 对 `-march=x86-64-v4` 的支持情况、`MAKEFLAGS` 并发数、构建目录与打包者信息；使用 CachyOS 版 `pacman` 时，`/etc/makepkg.conf` 默认已设为 `-march=native`，此处的 `-march=x86-64` 替换仅在使用标准 Arch `makepkg.conf` 时生效 |
| `cmdline.d/root.conf` | 根分区与休眠交换分区的 UUID、Btrfs 子卷名称及外接显示器 EDID 参数 |
| `mkinitcpio.d/linux.preset` | `/boot/vmlinuz-linux` 对应的目标内核名称，以及 `/efi` 是否为实机 EFI 分区挂载点 |
| `mkinitcpio.conf`、`initcpio/install/block` | 实机所需的 initramfs 钩子、内核模块与块设备驱动；`initcpio/install/block` 移除了 `drivers/mfd` 作为原机型的早期触控板规避项 |
| `modprobe.d/sound.conf` | Intel 声卡 DSP 驱动选择与无线网卡内核模块参数 |
| `tlp.conf` | 磁盘设备列表（`DISK_DEVICES`）、Intel GPU 频率上下限（`INTEL_GPU_*_FREQ_*`）及电池充放电策略 |
| `udev/hwdb.d/90-swap-caps-esc.hwdb` | 华为 `BoDE-WXX9` 机型的 DMI 标识与外接键盘的 `evdev:input` 设备号 |
| `conf.d/snapper`、`snapper/configs/{root,home}` | Btrfs 根分区与家目录子卷路径及 `.snapshots` 子卷初始化状态 |
| `environment` | 系统已生成的 `locale` 区域设置与输入法环境变量 |
| `de-wm/niri/.config/niri/configs/display/screen.kdl`、`de-wm/umbriel/.config/umbriel/configs/outputs.toml` | 实机显示器接口名称（如 `eDP-1`、`HDMI-A-1`）、分辨率、刷新率与缩放比例 |

仓库中的 `mkinitcpio.d/linux.preset` 仅针对官方 `linux` 内核编写，而软件包清单中同时包含 `linux-cachyos` 内核；在多内核环境下调整引导配置时，需同步检查 `/etc/mkinitcpio.d/` 下其余内核的 preset 文件。新设备恢复 Snapper 快照策略前，需先通过 `snapper -c root create-config /` 与 `snapper -c home create-config /home` 创建对应的 Btrfs `.snapshots` 子卷，再部署仓库中的 `conf.d/snapper`、`snapper/configs/{root,home}` 与 `snapper-timeline.timer.d/10-daily.conf` 覆盖默认策略。

## 系统服务

新系统完成软件包安装与 `/etc` 配置部署后，按以下清单启用常驻服务与定时器，并屏蔽与 TLP 无线电管理冲突的 `systemd-rfkill` 单元：

| 单元 | 状态 | 用途与前置条件 |
| --- | --- | --- |
| `plasmalogin.service` | 启用 | KDE Plasma 登录管理器 |
| `NetworkManager.service` | 启用 | 网络连接管理服务 |
| `bluetooth.service` | 启用 | 蓝牙协议栈守护进程 |
| `tlp.service`、`tlp-pd.service` | 启用 | TLP 电源管理与电源配置守护进程 |
| `scx_loader.service` | 启用 | `scx` 内核调度器加载服务 |
| `dae.service` | 启用 | 透明代理服务，启动前需先迁入离线备份的 `/etc/dae/` 配置 |
| `snapper-timeline.timer`、`snapper-cleanup.timer` | 启用 | Snapper 每日定时快照创建与过期快照清理，启用前需完成 Btrfs `.snapshots` 子卷初始化 |
| `systemd-rfkill.service`、`systemd-rfkill.socket` | 屏蔽 | 避免系统默认 rfkill 服务与 TLP 的无线电状态管理冲突 |

前置配置准备就绪后，可执行以下命令统一应用服务状态：

```bash
run0 systemctl enable --now \
    NetworkManager.service \
    bluetooth.service \
    tlp.service \
    tlp-pd.service \
    scx_loader.service \
    dae.service \
    snapper-timeline.timer \
    snapper-cleanup.timer
run0 systemctl enable plasmalogin.service
run0 systemctl mask systemd-rfkill.service systemd-rfkill.socket
```

## AVS 固件

搭载 Intel Tiger Lake 处理器并启用 `snd_soc_avs` 声卡驱动的机器需要加载专用的 DSP 基础固件。先将备份的固件文件放入仓库的 `private/firmware/intel/avs/tgl/dsp_basefw.bin`，再执行：

```bash
./install.sh --check firmware
./install.sh firmware
```

脚本会调用 `run0` 将该固件以 `0644` 权限安装到 `/usr/lib/firmware/intel/avs/tgl/dsp_basefw.bin`。

## 启动镜像

仓库的 `mkinitcpio.conf` 使用 `systemd` 与 `plymouth` 钩子，配合 `linux.preset` 将生成的统一内核镜像（UKI）输出到 `/efi/EFI/Linux/arch-linux.efi`。每次更新 `cmdline.d/root.conf`、`modprobe.d/sound.conf`、`mkinitcpio.conf` 或声卡固件后，先确认 EFI 分区已挂载在 `/efi`，再运行 `mkinitcpio -P` 为系统中所有内核预设重新构建启动镜像：

```bash
findmnt /efi
run0 mkinitcpio -P
```

仓库提供的 `etc/initcpio/install/block` 基于 mkinitcpio 41.1 定制，移除了 `drivers/mfd` 模块目录以规避原机器在早期引导阶段的触控板异常。由于 `/etc/initcpio/install/` 下的同名钩子会覆盖 `/usr/lib/initcpio/install/` 中的软件包版本，在系统升级 `mkinitcpio` 后，可通过以下命令比对上游改动并合入仓库副本，在新设备上若无需该硬件规避项则可从 `etc/` 与 `system_files` 中移除：

```bash
diff -u /usr/lib/initcpio/install/block etc/initcpio/install/block
```
