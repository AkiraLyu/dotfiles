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

各配置文件的部署方式由其读取时机和服务隔离要求决定。`environment` 与 `makepkg.conf.d/90-local.conf` 在用户会话登录或执行软件包构建时读取，此时用户家目录已经挂载，采用相对符号链接可使仓库内的修改即时生效。内核引导、包管理器、PAM 认证、内核模块和早期 udev 规则需要在系统启动早期或脱离用户家目录的环境中稳定读取，而 TLP 电源服务开启了 `ProtectHome=yes` 沙箱隔离无法访问 `/home`，因此这些文件均通过 `install -D` 复制为 `/etc` 下的独立文件，修改仓库文件后重新运行 `etc install` 即可更新。其中 Chrome 策略文件将 `WebRtcIPHandling` 设为 `disable_non_proxied_udp`，部署后可在 Chrome 的 `chrome://policy` 页面点击重新加载以验证生效状态；部署 `90-swap-caps-esc.hwdb` 时，脚本会自动追加执行 `systemd-hwdb update` 更新硬件数据库。

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
| `diff` | 比较仓库与实机 | 输出内容与文件权限差异，已链接到仓库或实机未部署的文件会给出状态提示 |
| `install` | 仓库 → `/etc` | 按预设方式建立相对链接或以源文件权限复制为独立文件 |
| `export` | `/etc` → 仓库 | 以当前普通用户身份将实机独立文件的内容和权限拷回仓库 |

由于 `install` 与 `export` 会直接覆盖目标文件，执行同步前应先运行 `etc diff` 检查差异。执行 `export` 时，脚本会自动跳过已链接到仓库同一文件的条目以及实机尚未部署的路径，并以普通用户身份写入仓库文件，从而确保导回仓库的文件具有正确的用户归属。

## 机器配置

将仓库迁移到新设备或更换硬件前，需先核对并调整以下与机器强相关的配置项：

| 文件 | 核对项 |
| --- | --- |
| `pacman.conf` | 软件源、密钥环、镜像列表和 `IgnorePkg`，详见[安装指南](install.md#准备环境) |
| `makepkg.conf.d/90-local.conf` | CPU 对 `-march=x86-64-v4` 的支持情况、`MAKEFLAGS` 并发数、构建目录与打包者信息 |
| `cmdline.d/root.conf` | 根分区与休眠交换分区的 UUID、Btrfs 子卷名称及外接显示器 EDID 参数 |
| `mkinitcpio.d/linux.preset` | `/boot/vmlinuz-linux` 对应的目标内核名称，以及 `/efi` 是否为实机 EFI 分区挂载点 |
| `mkinitcpio.conf`、`initcpio/install/block` | 实机所需的 initramfs 钩子、内核模块与块设备驱动 |
| `modprobe.d/sound.conf`、`tlp.conf` | 声卡 DSP 驱动选择、无线网卡参数与电池充放电阈值 |
| `udev/hwdb.d/90-swap-caps-esc.hwdb` | DMI 主板型号标识与外接键盘的 `evdev:input` 设备号 |
| `environment` | 系统已生成的 `locale` 区域设置与输入法环境变量 |

仓库中的 `mkinitcpio.d/linux.preset` 仅针对官方 `linux` 内核编写，而软件包清单中同时包含 `linux-cachyos` 内核；在多内核环境下调整引导配置时，需同步检查 `/etc/mkinitcpio.d/` 下其余内核的 preset 文件。

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
